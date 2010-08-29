var net = require('net'),
    http = require('http'),
    querystring = require('querystring'),
    url = require('url'),
    stat = require('./lib/node-static'),
    ws = require('./lib/ws'),
    ircclient = require('./lib/jerk/lib/jerk'),
    colors = require('./colors'),
    Step = require('./lib/step')


// for serving static files we're using http://github.com/cloudhead/node-static
var fileServer = new stat.Server()
    

// Store a list of clients waiting for the next response (for WS fallback)
var waitingclients = [];
    
http.createServer(function (req, res) {
    // later we'll inspect req.url to see whether
    // this path should be more interesting
    // for now we'll just delegate everything to our fileServer:

    // do the right thing with the root:
    if (req.url === '/') req.url = '/index.html'

    req.addListener('end', function() {
        // handle polling connections
        if (req.url.indexOf('/poll') != -1) {
            var client = function(newData) {
                res.writeHead(200, {
                    'Content-Length': newData.length,
                    'Content-Type': 'text/javascript'
                });
                res.write(newData, 'utf8');
                res.end();
            };
            waitingclients.push(client);
        } else {
            fileServer.serve(req,res)
        }
    })
}).listen(80);

// for pushing updates out to the clients
var websocket = ws.createServer();
websocket.listen(8080);

// HTTP client for freebase lookups
var freebaseclient = http.createClient(80, 'www.freebase.com')

// Look up a title in freebase, find types
var lookInFreebase = function(title, returnobj, callback) {
    // attempt to look up in freebase
    title = title.replace(/ \([^\)]+\)/, '');
    var url = '/experimental/topic/basic?id=/en/' + title.replace(/[^\w\d]/g, "_").toLowerCase()

    var request = freebaseclient.request('GET', url, {'host': 'www.freebase.com','user-agent': 'bloomclient'})
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
var lookInGoogle = function(title, returnobj, callback) {
    // attempt to look up in freebase
    var url = "/ajax/services/search/web?v=1.0&q='" + querystring.escape(title) + "'";

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
                        if (url.match(/ikipedia.org\/wiki/)) {
                            //console.log('pagerank for', url, i);
                            returnobj.googlerank = i;
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
var lookInWikipedia = function(title, returnobj, callback) {
    // attempt to look up in freebase
    var url = '/w/api.php?action=query&prop=info&inprop=protection|talkid&format=json&titles=' + querystring.escape(title)

    var request = wikipediaclient.request('GET', url, {'host': 'en.wikipedia.org', 'user-agent': 'bloomclient'})
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
var loadMetadata = function(title, responseobj) {
    Step(
        function loadData() {
            if (! title.match(specialmatcher)) {
                lookInFreebase(title, responseobj, this.parallel());
            }
            lookInWikipedia(title, responseobj, this.parallel());
            lookInGoogle(title, responseobj, this.parallel());
        },
        function renderContent(err) {
            responseobj.usercount = websocket.manager.length + waitingclients.length;
            var out = JSON.stringify(responseobj)
            //console.log('finally rendering', JSON.stringify(responseobj));
            websocket.broadcast(out);
            while (waitingclients.length) {
                var client = waitingclients.shift()
                // TODO: don't use a direct callback
                client("processEdit('" + out.replace(/'/g,"\\'") + "')")
            }
            waitingclients = [];
        }
    );
}


// Connect to wikipedia's IRC server, parse responses, dump as JSON
var ircoptions = {
    server: 'irc.wikimedia.org'
    ,nick: 'bloombot-'+(new Date().getTime()).toString(16)
    ,channels: ['#en.wikipedia']
}

// Parse out chunks from the wikipedia IRC channel
var irclinematcher = /^\[\[(.*)\]\] (.?) (http\S+) \* (.*) \* \(([+-]\d+)\) (.*)$/

ircclient(function(f) {
    f.watch_for(/.*/, function(message) {
        if (message.user === 'rc') {
            var rawtext = colors.removeFormattingAndColors(String(message.text))
            console.log(rawtext);
            // handle edits
            if (irclinematcher.test(rawtext)) {
                var matches = rawtext.match(irclinematcher)
                console.log(matches);
                if (matches.length > 1) {
                    // If we parsed successfully...
                    var title = matches[1]
                    var returnobj = { title: title,
                                      flags: matches[2],
                                      url: matches[3],
                                      user: matches[4],
                                      change: matches[5],
                                      text: matches[6] }
                    loadMetadata(title, returnobj);
                }
            }
            else {
                console.log(false);
            }
        }
    })
}).connect(ircoptions)

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
