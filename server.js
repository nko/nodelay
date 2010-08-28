var sys = require('sys'),
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


sys.puts('Server running!\n');
