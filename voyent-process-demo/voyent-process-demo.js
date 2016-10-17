Polymer({
	is: "voyent-process-demo",

    properties: {
        loggedIn: { type: Boolean, value: false, notify: true },
        /**
         * Defines the Voyent account of the realm.
         */
        account: { type: String },
        /**
         * Defines the Voyent realm to build actions for.
         */
        realm: { type: String },
        /**
         * Defines the Voyent host to use for services
         */
        host: { type: String, value: "dev.voyent.cloud", notify: true, reflectToAttribute: true },
        /**
         * Push group to attach and join automatically on valid initialization
         * The intent is to listen to the group the process is pushing status updates to
         */
        pushGroup: { type: String, value: "processDemoGroup", notify: true, reflectToAttribute: true },
        /**
         * Process model to execute in the Process Service
         */
        modelId: { type: String, value: null, notify: true, reflectToAttribute: true },
        /**
         * The selected model to load
         */
        selectedModel: { type: String, notify: true, observer: '_modelChanged' },
        /**
         * If there is a choosable fork we store the value here
         */
        selectedFork: { type: String, notify: true },
        /**
         * Milliseconds to wait before moving to a synthetic event
         */
        waitBeforeEvent: { type: Number, value: 1200, notify: true, reflectToAttribute: true },
        /**
         * Milliseconds to wait before moving to the end element
         */
        waitBeforeEnd: { type: Number, value: 1500, notify: true, reflectToAttribute: true },
        /**
         * Internal global variable for our bpmn-io.js viewer
         */
        _viewer: { type: Object }
    },
    
    /**
     * Define our initial tool data structure for backing our UI controls
     */
	ready: function() {
	    // Some BPMN constants for different types
	    this.TYPE_START = "bpmn:StartEvent";
	    this.TYPE_END   = "bpmn:EndEvent";
	    this.TYPE_ARROW = "bpmn:SequenceFlow";
	    this.TYPE_EVENT = "bpmn:IntermediateCatchEvent";
	    this.TYPE_GATE  = "bpmn:ExclusiveGateway";
	    this.TYPE_OUTGOING = "bpmn:outgoing";
	    this.TYPE_INCOMING = "bpmn:incoming";
	    
	    // Our internal XML from the service
	    this.xml = null;
	    
	    // Used by the process to send events back
	    this.processId = null;
	    
	    // Disable notifications from displaying, as we just need them for payload
        voyent.notify.config.toast.enabled = false;
        voyent.notify.config.native.enabled = false;
	    
        // Default to no forks and no models
        this._forks = [];
        this._models = [];
	},
	
	initialize: function() {
        if (!this.realm) {
            this.realm = voyent.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount();
        }
        if (!voyent.io.auth.isLoggedIn()) {
            this.set('loggedIn', false);
            return;
        }
        
        // If we reached this far we are logged in
        this.set('loggedIn', true);
        
        // Notify the user
        this.fire('message-info', 'Initialized and prepared to start');
        
        // Load a list of saved BPMN models
        this.retrieveModels();
        
        // Attach and join the push group
        voyent.xio.push.attach('http://' + this.host + '/pushio/' + this.account + '/realms/' + this.realm, this.pushGroup);
    
        // Handle incoming notifications
        // We don't need to display the notifications, since updating our process model image will show the user enough
        var _this = this;
        document.addEventListener('notificationReceived',function(e) {
            // Clear our old highlights
            _this.clearHighlights();
            
            // Figure out the name and ID that we're trying to update
            var updateName = e.detail.notification.subject + ' ' + e.detail.notification.details;
            var updateId = null;
            var elements = _this._viewer.definitions.rootElements[0].flowElements;
            for (var i in elements) {
                if (updateName == elements[i].name) {
                    updateId = elements[i].id;
                    _this.highlightById(updateId);
                    break;
                }
            }
            
            // Now we need to determine what element is next
            // This is because we could have a synthetic event the user needs to manually click to fire
            if (updateId !== null) {
                _this._viewer.moddle.fromXML(_this.xml, function(err, definitions, parseContext) {
                    // Can't do much without references
                    if (parseContext.references) {
                        // First loop through and find the outgoing connection/flow from our highlighted item
                        var outgoingConn = null;
                        for (var loopRef in parseContext.references) {
                            var currentRef = parseContext.references[loopRef];
                            
                            if (currentRef.property && currentRef.element.id == updateId) {
                                if (currentRef.property == _this.TYPE_OUTGOING) {
                                    outgoingConn = currentRef.id;
                                    break;
                                }
                            }
                        }
                        
                        // Now we check what the outgoing connection attaches to
                        if (outgoingConn !== null) {
                            for (var loopRef in parseContext.references) {
                                var currentRef = parseContext.references[loopRef];
                                
                                // A match is: same id as outgoing connection, type is incoming, and the element type is an event or end
                                if (currentRef.id === outgoingConn) {
                                    if (currentRef.property == _this.TYPE_INCOMING) {
                                        var matchId = currentRef.element.id;
                                        
                                        if (currentRef.element.$type === _this.TYPE_EVENT) {
                                            
                                            // Wait and then manually highlight, enable click, and show a hint to the user for the synthetic event
                                            setTimeout(function() {
                                                _this.clearHighlights();
                                                _this.highlightById(matchId);
                                                
                                                var overlays = _this._viewer.get('overlays');
                                                var tooltipOverlay = overlays.add(matchId, {
                                                    position: {
                                                      top: 70,
                                                      left: -15
                                                    },
                                                    html: '<div class="bpmnTip">Click envelope to send event</div>'
                                                });
                                                
                                                var clickListener = function(e) {
                                                    eventNode.removeEventListener('click', clickListener);
                                                    overlays.remove(tooltipOverlay);
                                                    
                                                    _this.sendSynthEvent(currentRef.element.name);
                                                };
                                                
                                                var eventNode = document.querySelector('[data-element-id=' + matchId + ']');
                                                eventNode.addEventListener('click', clickListener);
                                            }, _this.waitBeforeEvent);
                                            
                                            break;
                                        }
                                        // If the next element is the end we just jump to it after a pause
                                        // Then we clear the highlights after a second pause
                                        else if (currentRef.element.$type === _this.TYPE_END) {
                                            setTimeout(function() {
                                                _this.clearHighlights();
                                                _this.highlightById(matchId);
                                            }, _this.waitBeforeEnd);
                                            
                                            setTimeout(function() {
                                                _this.clearHighlights();
                                            }, _this.waitBeforeEnd*2);
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }
        });
	},
	
	/**
	 * Setup our BPMN diagram, using bpmn-io.js
	 */
	setupBPMN: function(logServiceError) {
	    // Get the XML for our model
	    var theUrl = "http://" + this.host + "/process/" + this.account + "/realms/" + this.realm + "/models/" + this.modelId + "?access_token=" + voyent.io.auth.getLastAccessToken();
	    var validResponse = false;
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = function receiveResponse(e) {
            if (this.readyState == 4) {
                validResponse = (this.status == 200);
            }
        };
        console.log("Retrieve model from: " + theUrl);
        xmlHttp.open("GET", theUrl, false);
        xmlHttp.send(null);
        
        // Ensure we have a valid response before continuing
        if (!validResponse) {
            if (logServiceError) {
                this.fire("message-error", "Failed to retrieve XML data for " + this.modelId + " from the service.");
            }
            return false;
        }
        
        // Parse our response
        var parsedJSON = JSON.parse(xmlHttp.responseText)[0];
        this.xml = parsedJSON.model;
        
        // Clear the div before adding the diagram, to prevent duplicates
	    document.getElementById("bpmn").innerHTML = '';
	    
	    // Setup our BPMN viewer and import the XML
        var BpmnViewer = window.BpmnJS;
        this._viewer = new BpmnViewer({
            container: '#bpmn',
            zoomScroll: { enabled: false }
        });
        var _this = this;
        this._viewer.importXML(this.xml, function(err) {
          if (err) {
              _this.fire("message-error", "Failed to render the BPMN diagram");
              console.error("Error: ", err);
          }
          else {
              // Zoom to center properly
              _this._viewer.get("canvas").zoom('fit-viewport', 'auto');
              
              // Loop through and disable each event, to make the diagram read-only
              var events = [
                  'element.hover',
                  'element.out',
                  'element.click',
                  'element.dblclick',
                  'element.mousedown',
                  'element.mouseup'
              ];
              var eventBus = _this._viewer.get('eventBus');
              events.forEach(function(event) {
                  eventBus.on(event, 1500, function(e) {
                      e.stopPropagation();
                      e.preventDefault();
                  });
              });
              
              // Generate any gateway fork options from the XML
              _this.parseForks();
              
              // Set our title
              _this.set("_title", parsedJSON.name);
              
              // Polymer workaround to ensure the local styles apply properly to our dynamically generated SVG
              _this.scopeSubtree(_this.$.bpmn, true);
          }
        });
        
        // When the window is resized update the zoom of the bpmn diagram to scale
        window.addEventListener('resize', function() {
            _this._viewer.get('canvas').zoom('fit-viewport', 'auto');
        });
	},
	
	parseForks: function() {
	    var _this = this;
	    this._viewer.moddle.fromXML(this.xml, function(err, definitions, parseContext) {
              if (parseContext.references) {
                  var outgoingConns = [];
                  for (var loopRef in parseContext.references) {
                      var currentRef = parseContext.references[loopRef];
                      
                      if (currentRef.element.$type == _this.TYPE_GATE) {
                          if (currentRef.property == _this.TYPE_OUTGOING) {
                              outgoingConns.push(currentRef.id);
                          }
                      }
                  }
                  
                  if (outgoingConns.length > 0) {
                      _this.set('_forks', []);
                      for (var loopRef in parseContext.references) {
                          var currentRef = parseContext.references[loopRef];
                          
                          if (outgoingConns.indexOf(currentRef.id) !== -1) {
                              if (currentRef.property == _this.TYPE_INCOMING) {
                                  // Some manual tweaking to remove "Update Status" for a known use case
                                  if (currentRef.element.name.indexOf("Update Status") !== -1) {
                                      _this.push('_forks', currentRef.element.name.replace("Update Status", ""));
                                  }
                                  else {
                                      _this.push('_forks', currentRef.element.name);
                                  }
                              }
                          }
                      }
                      
                      if (_this._forks.length > 0) {
                          _this.set('selectedFork', _this._forks[0]);
                      }
                  }
              }
        });
	},
	
	retrieveModels: function() {
        var _this = this;
        voyent.$.get('http://' + this.host + '/process/' + this.account + '/realms/' + this.realm + '/models?access_token=' + voyent.io.auth.getLastAccessToken()).then(function(response){
            if (response) {
                var jsonResponse = JSON.parse(response);
                for (var loopModel in jsonResponse) {
                    _this.push('_models', jsonResponse[loopModel]._id);
                }
                
                // If we only have a single model load it immediately
                if (_this._models.length === 1) {
                    _this.set('modelId', _this._models[0]);
                    _this.setupBPMN();
                }
            }
        });
	},
	
	startProcess: function() {
        // Clear old highlights
        this.clearHighlights();
        
        // Find our start event and highlight
        var start = this.getIdByType(this.TYPE_START);
        if (start && start.length > 0) {
            this.highlightById(start[0]);
        }
        
        // Then post to start the process, which should end up with us receiving status notifications
        var _this = this;
        voyent.$.post('http://' + this.host + '/process/' + this.account + '/realms/' + this.realm + '/processes/' + this.modelId + '?access_token=' + voyent.io.auth.getLastAccessToken()).then(function(response){
            _this.set('processId', response.processId);
            _this.fire('message-info', "Executed process '" + response.processName + "'");
        });
	},
	
	getIdByType: function(type) {
	    if (!type) {
	        return [];
	    }
	    
        var elements = this._viewer.definitions.rootElements[0].flowElements;
        var toReturn = [];
        for (var i in elements) {
            if (type == elements[i].$type) {
                toReturn.push(elements[i].id);
            }
        }
        return toReturn;
	},
	
	highlightById: function(id) {
	    if (id) {
	        this._viewer.get("canvas").addMarker(id, 'highlight');
	    }
	},
	
	clearHighlights: function() {
        var elements = this._viewer.definitions.rootElements[0].flowElements;
        var canvas = this._viewer.get("canvas");
        for (var i in elements) {
            if (elements[i].$type !== this.TYPE_ARROW) {
                canvas.removeMarker(elements[i].id, 'highlight');
            }
        }
	},
	
	sendSynthEvent: function(eventName) {
	    // Note the data parameters are case sensitive based on what the Process Service uses
        var event = {
            time: new Date().toISOString(),
            service: 'voyent-process-demo',
            event: eventName,
            type: 'synthetic-message-event-withProcessId',
            processId: this.processId,
            data: {
                'Fork': this.selectedFork,
                'target': 'process'
            }
        };
        
        // Debug infos
        console.log("Going to send event '" + eventName + "' with process ID " + this.processId + " and fork " + this.selectedFork);
        
        var _this = this;
	    voyent.io.event.createCustomEvent({ "event": event }).then(function() {
            _this.fire('message-info', "Successfully sent event '" + eventName + "'"); 
	    }).catch(function(error) {
	        _this.fire('message-error', "Failed to send event '" + eventName + "'");
	    });
	},
	
	hasModel: function(toCheck) {
	    return toCheck !== null;
	},
	
	_modelChanged: function() {
	    if (this.selectedModel && this.selectedModel !== null) {
            this.set('modelId', this.selectedModel);
            this.setupBPMN();
            
            var _this = this;
            setTimeout(function() {
                _this.selectedModel = null;
            }, 2000);
        }
	}
});