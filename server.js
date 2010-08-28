var sys = require('sys'),
http = require('http');
         
http.createServer(function (req, res) {
    setTimeout(function () {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
    }, 2000);
}).listen(80);
            
sys.puts('Server running!\n');
