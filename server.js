var sys = require('sys'),
    http = require('http'),
    url = require('url'),
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

var freebase = http.createClient(80, 'www.freebase.com')

var specialmatcher = /^([\w ]+:)/

ircclient(function(f) {
    f.watch_for(/.*/, function(message) {
        if (message.user === 'rc') {
            var rawtext = colors.removeFormattingAndColors(String(message.text));
            // handle edits
            if (irclinematcher.test(rawtext)) {
                var stuff = rawtext.match(irclinematcher);
                if (stuff.length > 1) {
                    var title = stuff[1];

                    var returnobj = {title: title,
                                    url: stuff[2],
                                    change: stuff[3],
                                    text: stuff[4]}

                    if (! title.match(specialmatcher)) {
                        // attempt to look up in freebase
                        var freebaseurl = '/en/' + title.replace(/[^\w\d]/g, "_").toLowerCase();
                        var request = freebase.request('GET', 
                                    '/experimental/topic/basic?id=' + freebaseurl,
                                    {'host': 'www.freebase.com'});
                        request.end();
                        request.on('response', function (response) {
                            var result = '';
                            response.setEncoding('utf8');
                            response.on('data', function (chunk) {
                                result += chunk;
                            });
                            response.on('end', function () {
                                returnobj.freebase = JSON.parse(result);
                                //console.log('parsing: ' + freebaseurl + ' for chunk ' + result)
                                websocket.broadcast(JSON.stringify(returnobj))
                                //console.log(JSON.stringify(returnobj) + '\n');
                            });
                        })
                } else {
                    websocket.broadcast(JSON.stringify(returnobj))
                    //console.log(JSON.stringify(returnobj) + '\n');
                    }
                }
            }
        }
    })
}).connect(ircoptions);


sys.puts('Server running!\n');
