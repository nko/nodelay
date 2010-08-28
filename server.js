var sys = require('sys'),
    http = require('http'),
    static = require('./lib/node-static');

// for serving static files we're using http://github.com/cloudhead/node-static
var fileServer = new static.Server();
    
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
            
sys.puts('Server running!\n');
