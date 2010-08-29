// Copyright: Max Carlson <http://maxcarlson.com/>
var utils = {
    // jsloaded[url] is false while loading, true after load
    jsloaded: {}
    // array of callbacks for each url
    ,jscallbacks: {}
    // handler executed when a library is loaded
    ,loadJSLibHandler: function (url) {
        //console.log('loaded', url);
        // update loader state
        utils.jsloaded[url] = true;
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
        utils.jsloaded[url] = false;
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
            }
        }

        script.setAttribute('src', url);
        addto.appendChild(script);
    }
}
