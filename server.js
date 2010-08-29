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
    
http.createServer(function (req, res) {
    // later we'll inspect req.url to see whether
    // this path should be more interesting
    // for now we'll just delegate everything to our fileServer:

    // do the right thing with the root:
    if (req.url == '/') req.url = '/index.html'

    req.addListener('end', function() {
        fileServer.serve(req,res)
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
    var freebaseurl = '/experimental/topic/basic?id=/en/' + title.replace(/[^\w\d]/g, "_").toLowerCase()

    var request = freebaseclient.request('GET', freebaseurl, {'host': 'www.freebase.com','user-agent': 'bloomclient'})
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
            var freebase = JSON.parse(responsedata)
            for (var id in freebase) {
                var responseobj = freebase[id]
                if (responseobj.status === '200 OK') {
                    returnobj.freebase = freebaseurl
                    returnobj.types = responseobj.result.type
                }
            }

            //console.log('parsing: ' + freebaseurl + ' for chunk ' + responsedata)
            callback();
            //websocket.broadcast(JSON.stringify(returnobj))
            //console.log(JSON.stringify(returnobj) + '\n')
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
            //websocket.broadcast(JSON.stringify(returnobj))
            //console.log(JSON.stringify(returnobj) + '\n')
        })
    })
}

// Make requests in parallel (eek!)
var loadMetadata = function(title, responseobj) {
    Step(
        function loadData() {
            lookInFreebase(title, responseobj, this.parallel());
            lookInWikipedia(title, responseobj, this.parallel());
        },
        function renderContent(err) {
            // respond now
            console.log('finally rendering', JSON.stringify(responseobj));
            websocket.broadcast(JSON.stringify(responseobj))
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
var irclinematcher = /.*\[\[(.*)\]\].*(http\S+).*\((.+)\) (.*)/

// Match wikipedia titles that are 'special', e.g. 'User talk:...'
var specialmatcher = /^([\w ]+:)/

ircclient(function(f) {
    f.watch_for(/.*/, function(message) {
        if (message.user === 'rc') {
            var rawtext = colors.removeFormattingAndColors(String(message.text))
            // handle edits
            if (irclinematcher.test(rawtext)) {
                var stuff = rawtext.match(irclinematcher)
                if (stuff.length > 1) {
                    var title = stuff[1]

                    var returnobj = {title: title,
                                    url: stuff[2],
                                    change: stuff[3],
                                    text: stuff[4]}

                    if (! title.match(specialmatcher)) {
                        loadMetadata(title, returnobj);
                        //lookInFreebase(title, returnobj)
                        //lookInWikipedia(title, returnobj)
                    } else {
                        // respond now
                        websocket.broadcast(JSON.stringify(returnobj))
                        //console.log(JSON.stringify(returnobj) + '\n')
                    }
                }
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
