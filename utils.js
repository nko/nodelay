// Copyright: Max Carlson <http://maxcarlson.com/>
var utils = {
    // hash of callbacks by url
    jscallbacks: {}
    // handler executed when a library is loaded
    ,loadJSLibHandler: function (url) {
        //console.log('loaded', url);
        // update loader state
        // execute callbacks
        var callbacks = utils.jscallbacks[url] || [];
        delete utils.jscallbacks[url];
        for (var i = 0, len = callbacks.length; i < len; ++i) {
            callbacks[i]();
        }
        callbacks.length = 0;
    }
    // Loads a JS library from the specified URL.
    ,loadJSLib: function (url, callback) {
        if (callback) {
            // add callback to queue if defined
            (utils.jscallbacks[url] || (utils.jscallbacks[url] = [])).push(callback);
        }
        //console.log('loading', url);
        var script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
//        script.setAttribute('defer', 'defer');
        // prefer adding scripts to the body - it's better for performance
        var addto = document.getElementsByTagName("body")[0] || document.getElementsByTagName("head")[0]
        if (script.readyState){ //IE 
            script.onreadystatechange = function(){
                if (script.readyState == "loaded" || script.readyState == "complete"){ 
                    script.onreadystatechange = null;
                    utils.loadJSLibHandler(url);
                    // prevent memory leaks in IE
                    addto.removeChild( script );
                }
            }
        } else { //Others 
            script.onload = function(){
                script.onload = null;
                utils.loadJSLibHandler(url);
                addto.removeChild( script );
            }
        }

        script.setAttribute('src', url);
        addto.appendChild(script);
    }
}
