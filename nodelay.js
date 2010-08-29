// these globals are for the Flash WebSocket implementation
WEB_SOCKET_SWF_LOCATION = "web-socket-js/WebSocketMain.swf";
WEB_SOCKET_DEBUG = true;

var url, message, status;

var minRetryWait = 5000,
    retryWait = minRetryWait, 
    maxRetryWait = 60000;

window.onload = function() {
    url = "ws://"+document.location.host+":8080";
    
    messageel = document.getElementById('messages');
    statusel = document.getElementById('status');
    statusel.innerHTML = "Connecting...";
    
    if (window.WebSocket) {
        var ws = new WebSocket(url);
    }
    if (ws) {
        setUpEvents(ws);
    } else {
        statusel.innerHTML = "";                
        startPolling();
    }
    
    initVis();
    
}

// Start polling for JS when WebSocket and Flash aren't available
function startPolling() {
    var pollurl = "http://"+document.location.host+'/poll' + (Math.random() * 10000);
    //console.log('startPolling', pollurl);
    var self = this;
    utils.loadJSLib(pollurl, function() {
        setTimeout(function() {
            //console.log('loaded', pollurl);
            self.startPolling();
        },1)
    })
}

function setUpEvents(ws) {

    ws.onclose = function() {
        statusel.innerHTML = "WebSocket closed, retrying in " + Math.round(retryWait/1000) + " seconds!";                
        setTimeout(function() {
            statusel.innerHTML = "Reconnecting...";                
            var retryWs = new WebSocket(url);
            setUpEvents(retryWs);
        }, retryWait);
        retryWait *= 2;
        retryWait = Math.min(maxRetryWait, retryWait);
    };

    ws.onerror = function() {
        statusel.innerHTML = "Error with WebSocket, try refreshing?";
    };

    ws.onopen = function() {
        statusel.innerHTML = "Connected! Waiting for messages...";
        retryWait = minRetryWait;
    };
    
    ws.onmessage = function(evt) {
        if (statusel.innerHTML == "Connected! Waiting for messages...") {
            statusel.innerHTML = "";
        }            
        processEdit(evt.data);                
    }
    
    // TODO: let's try reconnecting if the socket closes or hangs?
    
}

var __setlanguages = false;

function processEdit(data) {
    try {
        var edit = JSON.parse(data);
    } catch (e) {
        window.console && console.error && console.error('Failed to parse: ' + e + ' for: ' + data);
        return;
    }

    // Update user count
    usercountel = document.getElementById('updates');
    var userstring = 'Nodelay has ' + edit.usercount + ' user' + (edit.usercount == 1 ? '!' : 's!');
    usercountel.innerHTML = userstring;
    top.document.title = userstring;

    // Update languages table
    if (__setlanguages == false) {
        __setlanguages = true;
        langel = document.getElementById('languages');
        var langhtml = '';
        var currentlang = '';
        for (var desc in edit.languages) {
            var langcode = edit.languages[desc];
            langhtml += '<a href="' + '/?language=' + langcode + '">' + desc + '</a> ';
            if (window.location.search.indexOf(langcode) != -1) {
                currentlang += (currentlang !== '' ? ' and ' : '') + desc;
            }
        }
        langel.innerHTML = langhtml;

        langel = document.getElementById('lang');
        langel.innerHTML = currentlang;
    }

    // Update the HTML
    var li = document.createElement('li');
    li.innerHTML = formatEdit(edit);
    messageel.appendChild(li);
    if (messageel.children.length > 20) {
        messageel.removeChild(messageel.firstChild);
    }
    
    if (visRunning) {
        updateVis(edit);
    }
}

function formatEdit(edit) {
    // Add wikipedia metadata
    for (var pageid in edit.metadata.pages) {
        var page = edit.metadata.pages[pageid];
        var size = page.length;
        var time = ' <span class="time">' + relativeDate(parseDate(page.touched)) + '<\/span>'
    }
    var out = '<a target="_blank" href="'+edit.url+'">' + edit.title + '<\/a> '
    // Add types from metaweb
    if (edit.types) {
        var typetext = [];
        for (var i = 0, l = edit.types.length; i < l; i++) {
            var type = edit.types[i];
            typetext.push(type.text);
        }
        out += ' (' + typetext.join(', ') + ') ';
    }
    var user = ' by <span class="user">' + edit.user + '<\/span>';
    if (edit.flags.indexOf('B') >= 0) {
        // http://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Robot_icon.svg/40px-Robot_icon.svg.png
        user += " <img src=\"images/robot.png\">";
    }
    out += size + '<span class="change">' + edit.change + '<\/span> <span class="comment">' + edit.text + '<\/span>' + time + user;
    var rank = edit.googlerank;
    if (rank != null) {
        //console.log('google rank', rank);
        out = '<span style="opacity:' + ((10 - rank) / 10) + ';">' + out + '</span>';
    }
    return out;
}

// adapted from http://stackoverflow.com/questions/3085937/safari-js-cannot-parse-yyyy-mm-dd-date-format
function parseDate(input, format) {
    if (!input) return null;
    format = format || 'yyyy-mm-dd HH:MM:SS'; // default format
    var parts = input.match(/(\d+)/g), 
        i = 0, 
        fmt = {};
    // extract date-part indexes from the format
    format.replace(/(yyyy|dd|mm|HH|MM|SS)/g, function(part) { fmt[part] = i++; });
    return new Date(Date.UTC(parts[fmt['yyyy']], parts[fmt['mm']]-1, parts[fmt['dd']], parts[fmt['HH']], parts[fmt['MM']], parts[fmt['SS']]));
}

function relativeDate(then) {
    if(!then) return 'never';
    then = Math.floor(then.getTime() / 1000);
    var now = Math.floor(Date.now() / 1000);
    var t = now - then;
    if (t <= 1) {
        return "moments ago";
    }
    else if (t < 5) {
        return Math.round(t) + " seconds ago";
    }
    else if (t < 60) {
        return "about " + Math.round(t/10)*10 + " seconds ago";
    }
    t /= 60;
    if (t < 60) {
        t = Math.floor(t);
        return t + " minute" + (t == 1 ? '' : 's') + " ago";
    }
    t /= 60;
    if (t < 24) {
        t = Math.floor(t);
        return t + " hour" + (t == 1 ? '' : 's') + " ago";
    }
    t /= 24;
    if (t < 7) {
        t = Math.floor(t);
        return t + " day" + (t == 1 ? '' : 's') + " ago";
    }
    t /= 7;
    t = Math.floor(t);
    return t + " week" + (t == 1 ? '' : 's') + " ago";
}        

///////////////////// Protovis stuff goes here...

var visRunning = true;
var userNodes = {};

// TODO: we'll need to translate these if we want them to work for de, etc.
var types = [ "User", "Article", "Talk:", "Category:", "Wikipedia:", "File:", "Template:", "User:", "User talk:", "Portal:" ];

function updateVis(edit) {

    if (!(edit.user in userNodes)) {
        userNodes[edit.user] = {
            nodeName: edit.user,
            user: edit.user,
            group: 0, // User Nodes
            nodeIndex: nodes.length,
            lastTouched: Date.now(),
            x: randomX(),
            y: randomY() 
        }
        nodes.push(userNodes[edit.user]);
    }
    
    var userNode = userNodes[edit.user];
    if (userNode) { userNode.lastTouched = Date.now(); }

    var pos = userNode ? randomOffset(userNode) : randomOuter();
     
    var group = 1; // normal Articles
    // skip first two, they aren't prefixes
    for (var i = 2; i < types.length; i++) {
        if (edit.title.indexOf(types[i]) == 0) {
            group = i;
            break;            
        }
    }
        
    var node = { 
        nodeName: edit.title,
        group: group, // TODO: color based on edit type (special, talk, bot, etc)
        nodeIndex: nodes.length,
        lastTouched: Date.now(),
        x: pos.x,
        y: pos.y 
    };
    nodes.push(node)

    links.push({ source: userNode.nodeIndex, target: node.nodeIndex, value: 5 });

    // keep nodes to a manageable length, remove oldest one that isn't a type
    while (nodes.length > 100) {
    
        var sortedNodes = nodes.slice();
        sortedNodes.sort(function(a,b) {
            return a.lastTouched - b.lastTouched;
        });
        
        var dead = sortedNodes[0];

        // remove dead node and correct node indexes:
        nodes.splice(dead.nodeIndex, 1);
        for (var i = dead.nodeIndex; i < nodes.length; i++) {
            nodes[i].nodeIndex = i;
        };
        
        if (dead.user) {
            delete userNodes[dead.user];
        }
        
        // decrement source and target index and remove invalid links
        links = links.filter(function(link) {
            if (link.source == dead.nodeIndex || link.target == dead.nodeIndex) {
                return false;
            }
            if (link.source > dead.nodeIndex) {
                link.source -= 1;
            }
            if (link.target > dead.nodeIndex) {
                link.target -= 1;
            }
            return true;
        });
    }
    
    if (force) {
        force.reset();
        vis.render();
    }
}

function randomOffset(p) {
    var a = Math.random() * 2 * Math.PI;
    var r = Math.random() * 25;
    return {
        x: p.x + r*Math.cos(a),
        y: p.y + r*Math.sin(a)
    }
}

function randomOuter() {
    var w = document.getElementById('vis').offsetWidth;
    var h = document.getElementById('vis').offsetHeight;
    var a = Math.random() * 2 * Math.PI;
    var r = (0.5+Math.random()/2) * Math.min(w,h)/2;
    return {
        x: w/2 + (w/3)*Math.cos(a),
        y: h/2 + (h/3)*Math.sin(a)
    }
}

function randomX() {
    var w = document.getElementById('vis').offsetWidth;
    return w/2 + (2.0 * (Math.random() - 0.5)) * w/3;
}
function randomY() {
    var h = document.getElementById('vis').offsetHeight;
    return h/2 + (2.0 * (Math.random() - 0.5)) * h/3;
}

var force, vis;
var nodes = [];
var links = [];

function initVis() {

    var container = document.getElementById('vis'),
        colors = pv.Colors.category10();
    
    vis = new pv.Panel()
        .canvas('vis')
        .width(function() { return container.offsetWidth })
        .height(function() { return container.offsetHeight })
        .fillStyle('rgba(0,0,0,0.01)')
        .event("mousedown", pv.Behavior.pan().bound(true))
        .event("mousewheel", pv.Behavior.zoom().bound(true));
    
    force = vis.add(pv.Layout.Force)
        .nodes(function() { return nodes })
        .links(function() { return links })
        .bound(true)
        .springConstant(0.2)
        .chargeConstant(-5)
        .iterations(null); // continuous
    
    force.link.add(pv.Line)
        .strokeStyle('white')
        .lineWidth(0.5);
    
    force.node.add(pv.Dot)
        .size(function(d) { 
            var ageMult = 1.0 - Math.min(1.0, (Date.now() - d.lastTouched) / 15000);
            //var linkSize = Math.sqrt(100*d.linkDegree); //(d.type ? 100 : 10));
            return 1.0 + (ageMult*25.0);// + (linkSize); 
        })
        .fillStyle(function(d) { return d.fix ? "brown" : colors(d.group) })
        .strokeStyle(function(d) { return d.user ? 'white' : null })
        .lineWidth(1)
        .title(function(d) { return d.nodeName })
        .event("mousedown", pv.Behavior.drag())
        .event("drag", force).anchor(function(d) { return d.user ? 'right' : 'left' }).add(pv.Label)
    .visible(function(d) { return (Date.now() - d.lastTouched) < (d.user ? 5000 : 10000); })
    .textStyle(function(d) { return d.user ? 'white' : colors(d.group).brighter() })
    .text(function(d) { 
        return d.nodeName;
    });
    
    
    var reverseTypes = types.slice();
    reverseTypes.reverse();
    
    var legend = new pv.Panel()
        .canvas('legend')
        .width(function() { return container.offsetWidth })
        .height(function() { return container.offsetHeight })        
        .add(pv.Dot)
        .data(reverseTypes)
        .bottom(function(d) { return 15 + this.index * 15 })
        .size(15)
        .left(15)
        .fillStyle(function(d) { return colors(types.length - 1 - this.index) })
        .strokeStyle(function(d) { return this.index == types.length - 1 ? 'white' : null })
        .lineWidth(1)
      .anchor("right").add(pv.Label)
        .textAlign("left")
        .text(function(d) { return d })
        .textStyle(function(d) { return this.index == types.length - 1 ? 'white' : colors(types.length - 1 - this.index).brighter() });
    
    legend.render();
    vis.render();
    
    var resizeTimer = 0;
    window.onresize = function() {
        if (resizeTimer) {
            clearTimeout(resizeTimer);
        }
        resizeTimer = setTimeout(function() {
            vis.render();
        }, 50);
    }

}

function toggleVis() {
    visRunning = !visRunning;
    var link = document.getElementById('stop').getElementsByTagName('a')[0];
    if (visRunning) { 
        force.iterations(null);
        link.innerHTML = "stop hurting my ipad!"
    }
    else { 
        force.iterations(1);
        link.innerHTML = "start it up again!"
    }
    force.reset();
    vis.render();
    return false; // for event handlers
}
