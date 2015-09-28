bridgeit-web-components
============

BridgeIt Web Components are a work in progress to leverage the power of Web Components, Polymer, bridgeit.io.js and the BridgeIt Services platform. To use these components you will need a BridgeIt Account and Realm. You can create a free account in the [BridgeIt Console](http://dev.bridgeit.io/console).

### Usage

Get the basic dependencies manually, via a CDN, or with Bower: 

```
"dependencies": {
	"bridgeit.io.js" : "#gh-pages",
	"polymer" : "Polymer/polymer#~1.0.0"
},
```

Declare the bridgeit.js and brideit.io.js scripts and ensure that your page has ES6 Promise support:

```
<script src="//cdn.lukej.me/es6-promise/1.0.0/promise.min.js"></script>
<script>
	if( !("Promise" in window)){
		window.Promise = ES6Promise.Promise;
	}
</script>
<script src="//bridgeit.github.io/bridgeit.js/src/bridgeit.js"></script>
<script src="//bridgeit.github.io/bridgeit.io.js/lib/bridgeit.io.js"></script>
```

Declare the Web Components script:

```
<script src="../../webcomponentsjs/webcomponents-lite.min.js"></script>
```

Import the component you would like to use:

```
<link rel="import" href="bridgeit-locations.html">
```

Profit:

```
<bridgeit-locations id="userLocations" accessToken="xxx" realm="myRealm" account="myAccount" showUserLocations>
</bridgeit-locations>
```

### Demos

[&lt;bridgeit-location-simulator&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-location-simulator/)  
[&lt;bridgeit-locations&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-locations/)  
[&lt;bridgeit-log-viewer&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-log-viewer/)  
[&lt;bridgeit-query-editor&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-query-editor/)  