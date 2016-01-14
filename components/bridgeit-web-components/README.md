bridgeit-web-components
============

BridgeIt Web Components are a work in progress to leverage the power of Web Components, Polymer, bridgeit.io.js and the BridgeIt Services platform. To use these components you will need a BridgeIt Account and Realm. You can create a free account in the [BridgeIt Console](http://dev.bridgeit.io/console).

### Usage

Get the basic dependencies manually, via a CDN, or with Bower: 

```
"dependencies": {
	"polymer" : "Polymer/polymer#~1.0.0"
},
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
<bridgeit-locations id="userLocations" realm="myRealm" account="myAccount" showUserLocations>
</bridgeit-locations>
```

### Demos

[&lt;bridgeit-auth-provider&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-auth-provider/bridgeit-auth-provider/)  
[&lt;bridgeit-action-editor&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-action-editor/)  
[&lt;bridgeit-code-editor&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-code-editor/)  
[&lt;bridgeit-event-monitor&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-event-monitor/)  
[&lt;bridgeit-location-simulator&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-location-simulator/)  
[&lt;bridgeit-locations&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-locations/)  
[&lt;bridgeit-log-viewer&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-log-viewer/)  
[&lt;bridgeit-query-editor&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-query-editor/)  
[&lt;bridgeit-recognizer-editor&gt;](http://bridgeit.github.io/bridgeit-web-components/components/bridgeit-web-components/bridgeit-recognizer-editor/)  
