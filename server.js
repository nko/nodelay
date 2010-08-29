var net = require('net'),
    http = require('http'),
    querystring = require('querystring'),
    fs = require('fs'),
    url = require('url'),
    stat = require('./lib/node-static'),
    ws = require('./lib/ws'),
    jerk = require('./lib/jerk/lib/jerk'),
    colors = require('./colors'),
    Step = require('./lib/step')

// These are wikis with over 100000 articles in descending order of size
// http://meta.wikimedia.org/wiki/List_of_Wikipedias
var languages = {
    English: 'en'
    ,German: 'de'
    ,French: 'fr' 
    ,Polish: 'pl' 
    ,Italian: 'it' 
    ,Japanese: 'ja' 
    ,Spanish: 'es' 
    ,Dutch: 'nl' 
    ,Portuguese: 'pt' 
    ,Russian: 'ru' 
    ,Swedish: 'sv' 
    ,Chinese: 'zh' 
    ,Catalan: 'ca' 
    ,Norwegian: 'no' 
    ,Finnish: 'fi' 
    ,Ukrainian: 'uk' 
    ,Hungarian: 'hu' 
    ,Czech: 'cs' 
    ,Romanian: 'ro' 
    ,Turkish: 'tr' 
    ,Korean: 'ko' 
    ,Danish: 'da' 
    ,Esperanto: 'eo' 
    ,Arabic: 'ar' 
    ,Indonesian: 'id' 
    ,Vietnamese: 'vi' 
    ,Serbian: 'sr' 
    ,Volapük: 'vo' 
    ,Slovak: 'sk' 
    ,Lithuanian: 'lt' 
    ,Hebrew: 'he' 
    ,Bulgarian: 'bg' 
    ,Persian: 'fa' 
    ,Slovenian: 'sl' 
    ,'Waray-Waray': 'war'
}

// TODO: load counters

fs.createReadStream('counters.json', {
    flags: 'r',
    encoding: 'utf8'
})
var readBuffer = ''
fs.on('data', function(data) {
    readBuffer += data
})
fs.on('end', function() {
    var data = JSON.parse(readBuffer);
    numEdits += (data.numEdits || 0)
    setTimeout(saveCounters, 10000)
})

function saveCounters() {
    var toSave = JSON.stringify({ numEdits: numEdits })
    var writeStream = fs.createWriteStream('counters.json', {
        flags: 'w+',
        encoding: 'utf8'
    })
    writeSteam.on('close' function() {
        setTimeout(saveCounters, 10000)
    });
    writeStream.end(toSave)
}

var uniqueips = [];
var uniqueiphash = {};
var numEdits = 0;

// for serving static files we're using http://github.com/cloudhead/node-static
var fileServer = new stat.Server()

// Store a list of clients waiting for the next response (for WS fallback)
var waitingclients = [];

var writeResponse = function(res, str) {
    res.writeHead(200, {
        'Content-Length': str.length,
        'Content-Type': 'text/javascript'
    });
    res.write(str, 'utf8');
    res.end();
}
    
http.createServer(function (req, res) {
    // later we'll inspect req.url to see whether
    // this path should be more interesting
    // for now we'll just delegate everything to our fileServer:

    // do the right thing with the root:
    if (req.url === '/') req.url = '/index.html'

    req.addListener('end', function() {
        if (! uniqueiphash[req.socket.remoteAddress]) {
            uniqueiphash[req.socket.remoteAddress] = true;
            uniqueips.push(req.socket.remoteAddress);
            //console.log('added client IP', uniqueips);
        }
        var language
        // handle polling connections
        if (req.url.match(/^\/poll/)) {
            var client = function(newData) {
                writeResponse(res, newData)
            };
            waitingclients.push(client);
        } else if (req.url.match(/\?language=/)) {
            var language = req.url.match(/\?language=([\w,]+)$/)
            if (language && language.length > 1) {
                var langstr = language[1];
                if (thejerk && thejerk.join) {
                    var langlist = langstr.split(',');
                    for (var i = 0, l = langlist.length; i < l; i++) {
                        var onelang = langlist[i];
                        //console.log('found language', onelang)
                        thejerk.join('#' + onelang + '.wikipedia');
                    }
                }
                
                req.url = '/index.html?language=' + langstr
                fileServer.serve(req,res)
            } else {
                writeResponse(res, JSON.stringify(languages))
            }
        } else {
            fileServer.serve(req,res)
        }
    })
}).listen(80);

// for pushing updates out to the clients
var websocket = ws.createServer();
websocket.listen(8080);

var ircclient = function(languagestr) {
    var lang = languagestr
// HTTP client for freebase lookups
var freebaseclient = http.createClient(80, 'www.freebase.com')

// Look up a title in freebase, find types
var lookInFreebase = function(returnobj, callback) {
    var title = returnobj.title;
    // attempt to look up in freebase
    title = title.replace(/ \([^\)]+\)/, '');
    title = title.replace(/[^\w\d]/g, "_").toLowerCase()
    var url = '/experimental/topic/basic?id=/' + lang + '/' + title

    var request = freebaseclient.request('GET', url, {'host': 'www.freebase.com','user-agent': 'nodelay'})
    request.end()

    request.on('response', function (response) {
        response.setEncoding('utf8')

        var responsedata = ''
        response.on('data', function (chunk) {
            // Build up response data
            responsedata += chunk
        })

        // process when the response ends
        response.on('end', function () {
            //console.log('parsing: ' + url + ' for chunk ' + responsedata)
            var freebase = JSON.parse(responsedata)
            for (var id in freebase) {
                var responseobj = freebase[id]
                if (responseobj.status === '200 OK') {
                    returnobj.freebase = url
                    if (responseobj.result.type.length) {
                        returnobj.types = responseobj.result.type
                    }
                }
            }

            callback();
        })
    })
}

// HTTP client for google lookups
var googleclient = http.createClient(80, 'ajax.googleapis.com')
// Look up a title in freebase, find types
var lookInGoogle = function(returnobj, callback) {
    var title = returnobj.title;
    // attempt to look up in freebase
    var clientip = uniqueips[Math.floor(Math.random() * uniqueips.length)]
    //console.log('found clientip', clientip, uniqueips);
    var url = "/ajax/services/search/web?v=1.0&key=ABQIAAAANJy59z-JG5ojQlRVP3myHBQazc0JSD0GCdkBcD0H4asbApndtBRNVqQ4MvCnn6oQF6lHyWk4Q9S5AA&userip=" + clientip + "&q='" + querystring.escape(title) + "'";
    console.log('google request', url);

    var request = googleclient.request('GET', url, {'host': 'ajax.googleapis.com','referer': 'http://code.google.com/apis'})
    request.end()

    request.on('response', function (response) {
        response.setEncoding('utf8')

        var responsedata = ''
        response.on('data', function (chunk) {
            // Build up response data
            responsedata += chunk
        })

        // process when the response ends
        response.on('end', function () {
            console.log('parsing: ' + url + ' for chunk ' + responsedata)
            try {
                var data = JSON.parse(responsedata)
                if (data.responseData && data.responseData.results) {
                    var results = data.responseData.results;
                    for (var i = 0, l = results.length; i < l; i++) {
                        var url = results[i].unescapedUrl;
                        if (url.match(/wikipedia.org\/wiki/)) {
                            //console.log('pagerank for', url, i);
                            returnobj.googlerank = i;
                            break;
                        }

                    }
                }
            } catch (e) {
                //console.log('bad request: ' + e + ', ' + url + ' for chunk ' + responsedata)

            }
            callback();
        })
    })
}

// HTTP client for wikipedia metadata lookups
var wikipediaclient = http.createClient(80, 'en.wikipedia.org')

// Look up a title in freebase, find types
var lookInWikipedia = function(returnobj, callback) {
    var title = returnobj.title;
    // attempt to look up in freebase
    var url = '/w/api.php?action=query&prop=info&inprop=protection|talkid&format=json&titles=' + querystring.escape(title)

    var request = wikipediaclient.request('GET', url, {'host': 'en.wikipedia.org', 'user-agent': 'nodelay'})
    request.end()

    request.on('response', function (response) {
        response.setEncoding('utf8')

        var responsedata = ''
        response.on('data', function (chunk) {
            // Build up response data
            responsedata += chunk
        })

        // process when the response ends
        response.on('end', function () {
            //console.log('parsing: ' + url + ' for chunk ' + responsedata)
            var metadata = JSON.parse(responsedata)
            if (metadata.query) {
                returnobj.metadata = metadata.query;
            }

            callback();
        })
    })
}

// Match wikipedia titles that are 'special', e.g. 'User talk:...'
var specialmatcher = /^([\w ]+:)/

// Make requests in parallel (eek!)
var loadMetadata = function(returnobj) {
    var title = returnobj.title;
    Step(
        function loadData() {
            if (! title.match(specialmatcher)) {
                lookInFreebase(returnobj, this.parallel());
            }
            lookInWikipedia(returnobj, this.parallel());
            lookInGoogle(returnobj, this.parallel());
        },
        function renderContent(err) {
            numEdits++;
            returnobj.usercount = websocket.manager.length + waitingclients.length;
            returnobj.editcount = numEdits;
            returnobj.uniqueips = uniqueips.length;
            var out = JSON.stringify(returnobj)
            //console.log('finally rendering', JSON.stringify(returnobj));
            websocket.broadcast(out);
            // broadcast to long-poll clients
            while (waitingclients.length) {
                var client = waitingclients.shift()
                // TODO: don't use a direct callback
                client("processEdit('" + out.replace(/'/g,"\\'").replace(/"/g,'\\"') + "')")
            }
            waitingclients = [];
        }
    );
}

// Parse out chunks from the wikipedia IRC channel
// See: http://meta.wikimedia.org/wiki/Help:Recent_changes#Understanding_Recent_Changes
var irclinematcher = /^\[\[(.*)\]\] (.?) (http\S+) \* (.*) \* \(([+-]\d+)\) (.*)$/

// Connect to all channels in the languages hash
var channels = [];
for (var lang in languages) {
    var langcode = languages[lang];
    channels.push('#' + langcode + '.wikipedia');
}

return jerk(function(f) {
    f.watch_for(/.*/, function(message) {
        if (message.user === 'rc') {
            var rawtext = colors.removeFormattingAndColors(String(message.text))
            // handle edits
            if (irclinematcher.test(rawtext)) {
                var matches = rawtext.match(irclinematcher)
                if (matches.length > 1) {
                    // If we parsed successfully...
                    var returnobj = { title: matches[1]
                                      ,flags: matches[2]
                                      ,url: matches[3]
                                      ,user: matches[4]
                                      ,change: matches[5]
                                      ,text: matches[6]
                                      ,languages: languages
                                      ,source: message.source
                                    }
                    loadMetadata(returnobj)
                }
            }
        }
    })
}).connect({
    server: 'irc.wikimedia.org'
    ,nick: 'nodelay-'+(new Date().getTime()).toString(16)
    ,channels: channels
})
}

var thejerk = ircclient('en');

// this should allow the Flash websocket to connect to us in Firefox 3.6 and friends
// I found this example file at http://github.com/waywardmonkeys/netty-flash-crossdomain-policy-server/blob/master/sample_flash_policy.xml
var netserver = net.createServer(function(socket) {
    socket.setEncoding('utf8')
    socket.write('<?xml version="1.0"?>\n')
    socket.write('<!DOCTYPE cross-domain-policy SYSTEM "/xml/dtds/cross-domain-policy.dtd">\n')
    socket.write('<!-- Policy file for xmlsocket://socks.example.com -->\n')
    socket.write('<cross-domain-policy>\n')
    socket.write('   <!-- This is a master socket policy file -->\n')
    socket.write('   <!-- No other socket policies on the host will be permitted -->\n')
    socket.write('   <site-control permitted-cross-domain-policies="master-only"/>\n')
    socket.write('   <!-- Instead of setting to-ports="*", administrators can use ranges and commas -->\n')
    socket.write('   <allow-access-from domain="*" to-ports="8080" />\n')
    socket.write('</cross-domain-policy>\n')
    socket.end()
}).listen(843)

console.log('Server running!\n')
