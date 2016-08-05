Polymer({

    is: "voyent-event-monitor-repeat",
    
    properties: {
        /**
         * List of event monitor objects to loop and display
         */
        items: { type: Array, value: [], reflectToAttribute: true },
        /**
         * Internal ID maintained as we add/remove event monitors
         */
        _currentid: { type: Number, value: 0 },
        /**
         * Flag declaring whether we're polling or not
         */
        polling: { type: String, value: "false", reflectToAttribute: true }
    },
    
    /**
     * Switch our polling state to the opposite
     */
    toggleAllPolling: function() {
        if (this.polling === 'true') {
            this.stopAllPolling();
        }
        else {
            this.startAllPolling();
        }
    },
    
    /**
     * Stop polling on all our children event monitor graphs
     */
    stopAllPolling: function() {
        this.polling = 'false';
        
        this._stopPolling(this.items);
    },
    
    /**
     * Start polling on all our children event monitor graphs
     * This will use the previously defined poll method via pollCurrent
     */
    startAllPolling: function() {
        this.polling = 'true';
        
        for (var i = 0; i < this.items.length; i++) {
            if (this.items[i].eventmonitor._enablepoll == 'false') {
                this.items[i].eventmonitor._enablepoll = 'true';
                this.items[i].eventmonitor.pollCurrent();
            }
        }
    },
    
    /**
     * Wrap the passed data in a new event monitor component and add it to our collection
     * This new event monitor will be inserted at the top of our list
     * @param data array of metric events to wrap in an event monitor
     * @param function to be called when polling for new data (not required)
     */
    addEventMonitor: function(data) {
        var newEM = document.createElement('voyent-event-monitor');
        newEM.useresize = false; // We don't use any internal resize, since we'll globally override those
        newEM.usezoom = false; // Similarly we don't use an internal zoom
        newEM.id = "eventmonitor" + this._currentid++;
        newEM._data = data;
        
        // Add our new event monitor in a wrapper
        this.unshift('items', { selected: true, eventmonitor: newEM });
        
        // Append the new graph, but don't redraw the others so they maintain their zoom/pan state
        // We do this in a timeout to ensure the view template repeat is processed properly
        var _this = this;
        setTimeout(function() {
            _this._showSingleGraph(_this, newEM);
        },0);
        
        // Set a global resize that refreshes all graphs
        // This is necessary over using an individual event monitor resize since we need to re-add our overriden methods
        d3.select(window).on("resize", function() {
            _this.refreshGraphs();
        });
        
        // Finally check our global button state for rendering
        this._checkGlobalButtons();
        
        // We stop all polling and just have the user restart it once a new EM is added
        this.stopAllPolling();
        
        return newEM;
    },
    
    /**
     * Remove the passed event monitor from our collection
     * @param e event of a button click in our template repeat containing model data
     */
    removeEventMonitor: function(e) {
        var index = this.items.indexOf(e.model.item);
        if (index != -1) {
            this._stopPolling(this.splice('items', index, 1));
        }
    },
    
    /**
     * Remove any selected event monitors (which could be none)
     */
    removeSelectedEventMonitors: function() {
        for (var i = this.items.length-1; i >= 0; i--) {
            if (this.items[i].selected) {
                this._stopPolling(this.splice('items', i, 1));
            }
        }
    },
    
    /**
     * Remove all event monitors from our collection
     * This will empty our items list
     */
    removeAllEventMonitors: function() {
        if (this.items.length > 0) {
            this._stopPolling(this.splice('items', 0, this.items.length));
        }
    },
    
    /**
     * Move the passed event monitor to the top of the list
     * If the event monitor is already at the top nothing will be done
     * @param e event of a button click in our template repeat containing model data
     */
    moveTop: function(e) {
        var oldIndex = this.items.indexOf(e.model.item);
        if (oldIndex !== 0) {
            this._moveArrayItem(this.items, oldIndex, 0);
            this.refreshAll();
        }
    },
    
    /**
     * Move up the passed event monitor
     * If the event monitor is already at the top nothing will be done
     * @param e event of a button click in our template repeat containing model data
     */
    moveUp: function(e) {
        var oldIndex = this.items.indexOf(e.model.item);
        if (oldIndex > 0) {
            this._moveArrayItem(this.items, oldIndex, oldIndex-1);
            this.refreshAll();
        }
    },
    
    /**
     * Move down the passed event monitor
     * If the event monitor is already at the bottom nothing will be done
     * @param e event of a button click in our template repeat containing model data
     */
    moveDown: function(e) {
        var oldIndex = this.items.indexOf(e.model.item);
        if ((oldIndex != -1) && (oldIndex < (this.items.length-1))) {
            this._moveArrayItem(this.items, oldIndex, oldIndex+1);
            this.refreshAll();
        }
    },
    
    /**
     * Move the passed event monitor to the bottom of the list
     * If the event monitor is already at the bottom nothing will be done
     * @param e event of a button click in our template repeat containing model data
     */
    moveBottom: function(e) {
        var oldIndex = this.items.indexOf(e.model.item);
        if (oldIndex != (this.items.length-1)) {
            this._moveArrayItem(this.items, oldIndex, this.items.length-1);
            this.refreshAll();
        }
    },
    
    /**
     * Refresh both our items (which means cloning them to force an update from Polymer)
     *  and also reappend and redraw our set of graphs
     */
    refreshAll: function() {
        this.refreshItems();
        this.refreshGraphs();
    },
    
    /**
     * Assign our items var to a clone of itself, to prompt Polymer to update the view
     */
    refreshItems: function() {
        this.items = this.items.slice(0);
    },
    
    /**
     * Update every event monitor in our collection, which means appending it to it's parent container
     *  and also requesting a show/render of the data
     */
    refreshGraphs: function() {
        var _this = this;
        setTimeout(function() {
            var currentEM;
            for (var i = 0; i < _this.items.length; i++) {
                // Get our current event monitor object and show it
                currentEM = _this.items[i].eventmonitor;
                
                // Finally append the graph and show it
                _this._showSingleGraph(_this, currentEM);
            }
        },0);
    },
    
    //******************PRIVATE API******************
    /**
     * Convenience method to move an item inside an array from the passed index to the passed index
     * @param targetArray to modify
     * @param indexFrom index we are moving an item from
     * @param indexTo the desired index to move the item to
     * @private
     */
    _moveArrayItem: function(targetArray, indexFrom, indexTo) { 
        var targetElement = targetArray[indexFrom];
        var increment = (indexTo - indexFrom) / Math.abs (indexTo - indexFrom);
        
        for (var Element = indexFrom; Element != indexTo; Element += increment) { 
            targetArray[Element] = targetArray[Element + increment];
        }
    
        targetArray[indexTo] = targetElement;
    },
    
    /**
     * Show a single event monitor graph, which means appending it to it's parent container
     *  and also requesting a show/render of the data
     * @private
     */
    _showSingleGraph: function(_this,graphEM) {
        Polymer.dom(_this.root).querySelector("#" + graphEM.id + "wrap")
                .appendChild(graphEM);
        graphEM.show();
        
        // Add a custom zoom, that will override the existing zoom (because the listener name is the same)
        // This zoom will enable "global" zooming, which means any selected (via checkbox) event monitors will
        //  be kept in sync for zoom/pan
        var vis = d3.select("div#" + graphEM.id + "div").select("svg");
        var zoom = d3.behavior.zoom();
        vis.call(zoom.x(graphEM._ourxscale).on(graphEM._padID("zoom"), function() {
            // Always fire our current zoom, regardless of selection
            // This ensures the user gets immediate feedback when zooming a single graph
            graphEM._externalZoom();
            
            // Loop through our items and fire zoom for any that are selected
            var currentEM;
            for (var i = 0; i < _this.items.length; i++) {
                if (_this.items[i].selected) {
                    currentEM = _this.items[i].eventmonitor;
                    
                    // Zoom the currently selected eventmonitor (if it isn't us, which would already be zoomed)
                    if (currentEM != graphEM) {
                        currentEM._externalZoom(graphEM._ourxscale.domain()[0], graphEM._ourxscale.domain()[1]);
                    }
                }
            }
        }));
    },
    
    /**
     * Method to check the state of our collection and determine if we should show our global buttons
     * Generally we don't want these global buttons to display unless we actually have items to act upon
     * @private
     */
    _checkGlobalButtons: function() {
        var displayStyle = "none";
        if (this.items.length > 0) {
            displayStyle = "inline";
        }
        Polymer.dom(this.root).querySelector("#globalButtons").style.display = displayStyle;
    },
    
    /**
     * Loop through the passed list of event monitors (wrapped with {selected, eventmonitor}
     * For each event monitor we toggle the internal _enablepoll flag to false
     * This method is normally called after event monitors have been removed from our group
     * @private
     */
    _stopPolling: function(removedEMs) {
        for (var i = 0; i < removedEMs.length; i++) {
            removedEMs[i].eventmonitor._enablepoll = 'false';
        }
    }
});