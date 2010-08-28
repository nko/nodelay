var sys = require('sys'),
    net = require('net'),
    http = require('http'),
    stat = require('./lib/node-static'),
    ws = require('./lib/ws'),
    ircclient = require('./lib/jerk/lib/jerk'),
    colors = require('./colors');


// for serving static files we're using http://github.com/cloudhead/node-static
var fileServer = new stat.Server();
    
http.createServer(function (req, res) {

    // later we'll inspect req.url to see whether
    // this path should be more interesting
    // for now we'll just delegate everything to our fileServer:

    // do the right thing with the root:
    if (req.url == '/') req.url = '/index.html';

    req.addListener('end', function() {
        fileServer.serve(req,res);
    });
    
}).listen(80);


var websocket = ws.createServer();

websocket.addListener("connection", function(connection){
  connection.addListener("message", function(msg){
    websocket.broadcast(msg);
  });
});

websocket.listen(8080);


var ircoptions = {
    server: 'irc.wikimedia.org'
    ,nick: 'bloombot-'+(new Date().getTime()).toString(16)
    ,channels: ['#en.wikipedia']
}

var irclinematcher = /.*\[\[(.*)\]\].*(http\S+).*\((.+)\) (.*)/

ircclient(function(f) {
    f.watch_for(/.*/, function(message) {
        if (message.user === 'rc') {
            var rawtext = colors.removeFormattingAndColors(String(message.text));
            // handle edits
            if (irclinematcher.test(rawtext)) {
                var stuff = rawtext.match(irclinematcher);
                if (stuff.length > 1) {
                    var returnobj = {title: stuff[1],
                                     url: stuff[2],
                                     change: stuff[3],
                                     text: stuff[4]}
                    websocket.broadcast(JSON.stringify(returnobj))
                    //sys.print(JSON.stringify(returnobj) + '\n');
                }
            }
        }
    })
}).connect(ircoptions);

// this should allow the Flash websocket to connect to us in Firefox 3.6 and friends
// I found this example file at http://github.com/waywardmonkeys/netty-flash-crossdomain-policy-server/blob/master/sample_flash_policy.xml
var netserver = net.createServer(function(socket) {
    socket.setEncoding('utf8');
    socket.write('<?xml version="1.0"?>\n');
    socket.write('<!DOCTYPE cross-domain-policy SYSTEM "/xml/dtds/cross-domain-policy.dtd">\n');
    socket.write('<!-- Policy file for xmlsocket://socks.example.com -->\n');
    socket.write('<cross-domain-policy>\n');
    socket.write('   <!-- This is a master socket policy file -->\n');
    socket.write('   <!-- No other socket policies on the host will be permitted -->\n');
    socket.write('   <site-control permitted-cross-domain-policies="master-only"/>\n');
    socket.write('   <!-- Instead of setting to-ports="*", administrators can use ranges and commas -->\n');
    socket.write('   <allow-access-from domain="*" to-ports="8080" />\n');
    socket.write('</cross-domain-policy>\n');
    socket.end();
}).listen(843);

sys.puts('Server running!\n');
