var net = require('net'),
    http = require('http'),
    querystring = require('querystring'),
    fs = require('fs'),
    url = require('url'),
    stat = require('./lib/node-static'),
    stat = require('./lib/node-static'),
    ws = require('./lib/ws'),
    IRC = require('./lib/irc/lib/irc'),
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

var uniqueips = [];
var uniqueiphash = {};
var numEdits = 0;
var categorycounter = {};
var categorynames = {};

// load counters
try {
    var readBuffer = fs.readFileSync('counters.json');
    //console.log('data loaded');
    var data = JSON.parse(readBuffer)
    numEdits += (data.numEdits || 0)
    if (data.uniqueips && data.uniqueips.length) {
        data.uniqueips.forEach(function(ip) {
            if (!(ip in uniqueiphash)) {
                uniqueiphash[ip] = true
                uniqueips.push(ip)
            }
        })
    }
    if (data.categorycounter) {
        categorycounter = data.categorycounter
    }
    if (data.categorynames) {
        categorynames = data.categorynames
    }
} catch(e) {
    console.log('persistence read error' + e);
}

function saveCounters() {
    try {
        var toSave = JSON.stringify({ 
            time: Date.now(),
            numEdits: numEdits,
            uniqueips: uniqueips,
            categorycounter: categorycounter,
            categorynames: categorynames
        })

        fs.writeFileSync('counters.json', toSave)
        //console.log('data saved');
    } catch (e) {
        console.log('persistence write error' + e);
    }
}
setInterval(function() {saveCounters()}, 10000)

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

    var page = 'index.html';
    if (req.url.match(/\?viz=/)) {
        page = req.url.match(/\?viz=(.+)$/)
    }
    // do the right thing with the root:
    if (req.url === '/') req.url = '/' + page

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
                if (wikiclient && wikiclient.join) {
                    var langlist = langstr.split(',');
                    for (var i = 0, l = langlist.length; i < l; i++) {
                        var onelang = langlist[i];
                        //console.log('found language', onelang)
                        wikiclient.join('#' + onelang + '.wikipedia');
                    }
                }
                
                req.url = '/' + page + '?language=' + langstr
                fileServer.serve(req,res)
            } else {
                writeResponse(res, JSON.stringify(languages))
            }
        } else if (req.url.match(/^\/categories/)) {
            writeResponse(res, JSON.stringify({categorycounter: categorycounter, categorynames: categorynames}))
        } else {
            fileServer.serve(req,res)
        }
    })
}).listen(80);

// for pushing updates out to the clients
var websocket = ws.createServer();
websocket.listen(8080);

var ircclient = function() {
    // HTTP client for freebase lookups
    var freebaseclient = http.createClient(80, 'www.freebase.com')

    // Look up a title in freebase, find types
    var lookInFreebase = function(returnobj, callback) {
        var title = returnobj.title;
        // attempt to look up in freebase
        title = title.replace(/ \([^\)]+\)/, '');
        title = title.replace(/[^\w\d]/g, "_").toLowerCase()
        var lang = returnobj.source.substring(1,3);
        var url = '/experimental/topic/basic?id=/' + lang + '/' + title
        //console.log('lookInFreebase', url, returnobj.source);

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
                            // Update category counter
                            for (var i in returnobj.types) {
                                var type = returnobj.types[i];
                                if (categorycounter[type.id] == null) {
                                    categorycounter[type.id] = 1;
                                } else {
                                    categorycounter[type.id]++;
                                }
                                categorynames[type.id] = type.text;
                                //console.log('found type', JSON.stringify(categorycounter));
                            }
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
        //console.log('google request', url);

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
                //console.log('parsing: ' + url + ' for chunk ' + responsedata)
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
                returnobj.usercount = websocket && websocket.manager && websocket.manager.length + waitingclients.length;
                returnobj.editcount = numEdits;
                returnobj.uniqueips = uniqueips.length;
                var out = JSON.stringify(returnobj)
                //console.log('finally rendering', JSON.stringify(returnobj));
                websocket.broadcast(out);
                // broadcast to long-poll clients
                while (waitingclients.length) {
                    var client = waitingclients.shift()
                    // TODO: don't use a direct callback
                    client("receivePoll('" + out.replace(/'/g,"\\'").replace(/"/g,'\\"') + "')")
                }
                waitingclients = [];
            }
        );
    }

    // Parse out chunks from the wikipedia IRC channel
    // See: http://meta.wikimedia.org/wiki/Help:Recent_changes#Understanding_Recent_Changes
    var irclinematcher = /^\[\[(.*)\]\] (.?) (http\S+) \* (.*) \* \(([+-]\d+)\) (.*)$/

    var parsemessage = function(message) {
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
                                    ,source: message.source
                                    }
                    loadMetadata(returnobj)
                }
            }
        }
    }

    return function(config) {
        var bot = new IRC(config);
        bot.addListener('privmsg', function (rawmessage) {
            //console.log('got message from', config.server, JSON.stringify(rawmessage));
            parsemessage({
                user: rawmessage.person.nick
                ,source: rawmessage.params[0]
                ,text: rawmessage.params[1]
            })
        })
        bot.connect(function() {
            //console.log('connected to', config.server);
            var channels = config.channels;
            var server = config.server;
            setTimeout(function() {
                for (var i = 0, l = config.channels.length; i < l; i++) {
                    var chan = config.channels[i];
                    //console.log('joining', chan, 'on', config.server);
                    bot.join(chan);
                }
            }, 1000);
        })
        return bot;
    }
}();

// Connect to all channels in the languages hash
var wikipediachannels = [];
for (var lang in languages) {
    var langcode = languages[lang];
    wikipediachannels.push('#' + langcode + '.wikipedia');
}

var wikiclient = new ircclient({
    server: 'irc.wikimedia.org'
    ,nick: 'nodelay-'+(new Date().getTime()).toString(16)
    ,channels: wikipediachannels
});

var olclient = new ircclient({
    server: 'irc.freenode.org'
    ,nick: 'nodelay-'+(new Date().getTime()).toString(16) + '2'
    ,channels: ['#openlibrary_rc']
});

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

process.on('exit', function() {
    saveCounters();
    //console.log('exit');
})

process.on('err', function() {
    //console.log('err');
    saveCounters();
})

process.on('SIGINT', function(e) {
    //console.log('SIGINT');
    process.exit(0);
})

process.on('uncaughtException', function(error) {
    saveCounters()
    // From the v8 APIs, see node/src/node.js line 720
    Error.captureStackTrace(error)
    console.log('uncaughtException', error.stack);
    process.exit(0);
})

console.log('Server running!\n')
