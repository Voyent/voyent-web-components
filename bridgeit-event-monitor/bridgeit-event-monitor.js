Polymer({

    is: "bridgeit-event-monitor",
    
    properties: {
        /** Defines the ID of this component
         * @default eventmonitor
         */
        id: { type: String, value: "eventmonitor", reflectToAttribute: true },
        /**
         * Defines the array of data used to generate this event monitor graph
         * Note this property is private to avoid duplicating the data on the page as an HTML attribute
         */
        _data: { type: Array },
        /**
         * Defines the width of the underlying SVG element
         * @default 100%
         */
        width: { type: String, value: "100%" },
        /**
         * Defines the height of the underlying SVG element
         * @default 100px
         */
        height: { type: String, value: "100px" },
        /**
         * Defines the width padding of the graph inside the SVG element
         * @default 0
         */
        padding: { type: Number, value: 0 },
        /**
         * Defines the circle radius for all events show on the graph
         * @default 10
         */
        circleradius: { type: Number, value: 10 },
        /**
         * Defines the default color to use for events coming from an unknown service
         * @default orange
         */
        defaultcolor: { type: String, value: "orange" },
        /**
         * Defines whether to show the graph Legend or not
         * @default true
         */
        uselegend: { type: String, value: "true" },
        /**
         * Defines whether to enable zoom in/out functionality (via mousewheel) for the graph
         * @default true
         */
        usezoom: { type: String, value: "true" },
        /**
         * Defines whether to enable drag/panning functionality for the graph
         * @default true
         */
        usedrag: { type: String, value: "true" },
        /**
         * Defines whether events show on the graph should be clickable or not
         * If clickable the details of the event will be shown as part of this component
         * @default true
         */
        useclickable: { type: String, value: "true" },
        /**
         * Defines whether to enable mouseover features of event circles
         * When enabled mousing over a circle will bring it to the front, temporarily increase the size, and border it
         * @default true
         */
        usemouseover: { type: String, value: "true" },
        /**
         * Defines whether the graph should be dynamically and responsively resized as the browser width/height changes
         * @default true
         */
        useresize: { type: String, value: "true" },
        /**
         * Defines the ID of the details pane container, used for consistency
         * @default eventDetails
         */
        detailsid: { type: String, value: "eventDetails" },
        /**
         * Defines our zoom that is used internally by D3
         */
        _ourzoom: { type: Object },
        /**
         * Defines our X-Scale, which is a series of dates and is used by the X-Axis
         */
        _ourxscale: { type: Object },
        /**
         * Defines our X-Axis that is used internally by D3
         */
        _ourxaxis: { type: Object }
    },
    
    /**
     * Method to graph and show the passed data
     * This will also store the data internally as data
     * @param data array of metric events to show on the graph
     */
    showData: function(data) {
        this._data = data;
        this.show();
    },
    
    /**
     * Method to graph and show the current data object
     * Nothing will happen if data is null or missing
     * If you don't want to set data directly use showData instead
     */
    show: function() {
        this._generateGraph(this._data);
    },
    
    /**
     * Show our event detail data panel for the clicked item
     */
    showDetails: function() {
        document.getElementById(this._padID(this.detailsid)).style.display = "inline";
    },
    
    /**
     * Hide our event detail data panel, which would be shown upon clicking on a graph element
     */
    hideDetails: function() {
        document.getElementById(this._padID(this.detailsid)).style.display = "none";
        
        if (this.clickedCircle) {
            var old = d3.select(this.clickedCircle);
            if (old) {
                old.attr("r", this.circleradius);
                old.classed("clickedCircle", false);
            }
        }
        this.clickedData = null;
        this.clickedDataFormatted = null;
    },
    
    //******************PRIVATE API******************
    
    /**
     * Internal method to display a marble style graph based on the passed metric data
     * @param data array of the metric events to show on the graph
     * @private
     */
    _generateGraph: function(data) {
        var _this = this;
        var wrapper = d3.select("div#" + this.id + "div");
        
        // Bail if we can't find our div container
        if (typeof wrapper === 'undefined' || wrapper === null) {
            console.log("No SVG container was found that matches ID " + this.id + ", not drawing event monitor.");
            return;
        }
        
        // First of all remove the old SVG (if we can) and append a fresh one and use that
        wrapper.select("svg").remove();
        wrapper.insert("svg", ".detailsBox");
        var vis = wrapper.select("svg");
        
        // Set our cursor and basic width/height and then calculate the result without units
        vis.style("cursor", null);
        vis.attr("width", this.width);
        vis.attr("height", this.height);
        var calcWidth = parseInt(vis.style("width"))-this.padding;
        var calcHeight = parseInt(vis.style("height"));
        
        // Sizing minimum
        if (calcWidth < 100 && window.innerWidth && window.innerWidth > 500) {
            calcWidth = window.innerWidth - 400;
        }
        
        // Before progressing check if we even have data to graph
        // If we don't we'll disable zoom/drag and show an error message
        if (typeof data === "undefined" || data === null || data.length === 0) {
            console.log("No data was passed to event monitor graph.");
            
            this.customTitle = null;
            
            vis.call(d3.behavior.zoom().on(this._padID("zoom"), null));
            vis.call(d3.behavior.drag().on(this._padID("drag"), null));
            
            vis.append("g").attr("class", "axis");
            vis.append("text").text("No event data was found, please try again.")
                .attr("x", this.padding)
                .attr("y", calcHeight/2)
                .attr("fill", "red");
            
            return;
        }
        
        // Style our wrapper box
        wrapper.classed("emBox", true);
        
        // Setup our colors
        var colors = {};
        colors['query'] = "crimson";
        colors['storage'] = "purple";
        colors['metrics'] = "gold";
        colors['locate'] = "cornflowerblue";
        colors['docs'] = "forestgreen";
        colors['action'] = "sienna";
        colors['eventhub'] = "darkturquoise";
        colors['push'] = "hotpink";
        
        // Generate a list of services used from the data
        // This is a bit complex, but we loop through our data and look for unique services
        var services = [];
        var addCurrent;
        for (i = 0; i < data.length; i++) {
            addCurrent = false;
            // Add the first service automatically
            if (services.length === 0) {
                addCurrent = true;
            }
            // Otherwise check the existing services list against our data object
            // If we don't find a match we'll add the service
            else {
                addCurrent = true;
                for (j = 0; j < services.length; j++) {
                    if (services[j] == data[i].service) {
                        addCurrent = false;
                        break;
                    }
                }
            }
            
            if (addCurrent) {
                services.push(data[i].service);
            }
        }
        
        // Build our date scale
        this._ourxscale = d3.time.scale().range([this.padding, calcWidth-this.padding]);
        this._ourxscale.domain([d3.min(data, function(d) {
            return new Date(d.time);
        }), d3.max(data, function(d) {
            return new Date(d.time);
        })]);
        
        // Use the scale to make an axis
        // Remember to keep the number of ticks relative to the calculated width, to allow for responsive resizing
        this._ourxaxis = d3.svg.axis().scale(this._ourxscale)
                    .orient("bottom")
                    .tickPadding(5)
                    .ticks(Math.max(calcWidth/120, 2));
        
        // Vertically center the graph
        vis.append("g")
            .attr("class", "axis")
            .attr("transform", "translate(0," + (calcHeight/2) + ")")
            .call(this._ourxaxis);
            
        // Add zoom functionality
        if (this.usezoom == 'true') {
            this._ourzoom = d3.behavior.zoom();
            vis.call(this._ourzoom
                .x(this._ourxscale)
                .on(this._padID("zoom"), function() {
                    // Perform the scale and translation from our event
                    _this._ourzoom.scale(d3.event.scale);
                    _this._ourzoom.translate(d3.event.translate);
                    
                    // Update the Axis (as our X-Scale domain has changed)
                    vis.select("g.axis").call(_this._ourxaxis);
                    
                    // Finally redraw all our circles using the new X-Scale
                    vis.selectAll("circle")
                        .attr("cx", function(d) { return _this._ourxscale(new Date(d.time)); });
                })
                .on(this._padID("zoomstart"), function() {
                    vis.style("cursor", "zoom-in");
                })
                .on(this._padID("zoomend"), function() {
                    vis.style("cursor", null);
                })
            );
        }
        else {
            vis.call(d3.behavior.zoom().on(this._padID("zoom"), null));
            vis.call(d3.behavior.zoom().on(this._padID("zoomstart"), null));
            vis.call(d3.behavior.zoom().on(this._padID("zoomend"), null));
        }
        
        if (this.usedrag == 'true') {
            // Customize our drag functionality
            vis.call(d3.behavior.drag()
                .on(this._padID("dragstart"), function() {
                    vis.style("cursor", "move");
                    d3.select("body").style("cursor", "move");
                })
                .on(this._padID("dragend"), function() {
                    vis.style("cursor", null);
                    d3.select("body").style("cursor", null);                   
                })
            );
        }
        else {
            vis.call(d3.behavior.drag().on(this._padID("drag"), null));
            vis.call(d3.behavior.drag().on(this._padID("dragstart"), null));
            vis.call(d3.behavior.drag().on(this._padID("dragend"), null));
        }
        
        // Draw a circle for every piece of data
        var clickedCircle; // Used to track SVG object that was clicked
        vis.selectAll("circle.line")
            .data(data)
            .enter().append("circle")
            .attr("cy", calcHeight/2)
            .attr("cx", function(d) { return _this._ourxscale(new Date(d.time)); })
            .attr("r", this.circleradius)
            .attr("stroke", "black")
            .attr("stroke-width", 1)
            .attr("cursor", function() { return (_this.useclickable == 'true') ? "pointer" : null; })
            .attr("title", function (d) { return new Date(d.time); })
            .style("fill", function(d) {
                var toReturn = colors[d.service];
                if (!toReturn) {
                    return _this.defaultcolor;
                }
                return toReturn; 
            })
            .on(this._padID("click"), function(d, i) {
                if (_this.useclickable == 'true') {
                    // Check if we're re-clicking the same circle, in which case we want to hide the details
                    // This will basically function as a toggle
                    if (d == _this.clickedData) {
                        _this.hideDetails();
                        
                        return;
                    }
                    
                    // Then we restore any previously clicked circle to the normal radius
                    if (_this.clickedCircle) {
                        var old = d3.select(_this.clickedCircle);
                        old.attr("r", _this.circleradius);
                        old.classed("clickedCircle", false);
                    }
                    
                    // Otherwise set our data object for display on the page and show the details
                    var sel = d3.select(this);
                    sel.attr("r", _this.circleradius*2);
                    sel.classed("clickedCircle", true);
                    _this.clickedCircle = this;
                    _this.clickedData = d;
                    _this.clickedDataFormatted = JSON.stringify(d.data);
                    _this.showDetails();
                }
            })
            .on(this._padID("mouseover"), function(d, i) {
                if (_this.usemouseover == 'true') {
                    var sel = d3.select(this);
                    // Only do mouseover radius functionality if we're not already clicked
                    if (!sel.classed("clickedCircle")) {
                        sel.attr("r", _this.circleradius+3);
                    }
                    // Always change stroke width and bring to the front though
                    sel.transition().attr("stroke-width", 2);
                    this.parentElement.appendChild(this);
                }
            })
            .on(this._padID("mouseout"), function(d, i) {
                if (_this.usemouseover == 'true') {
                    var sel = d3.select(this);
                    // Only do mouseout radius functionality if we're not already clicked
                    if (!sel.classed("clickedCircle")) {
                        sel.attr("r", _this.circleradius);
                    }
                    sel.transition().attr("stroke-width", 1);
                }
            });
        
        // Add a legend showing service color and corresponding name
        if (this.uselegend == 'true') {
            var legend = vis.append('g')
                .attr('class', 'legend')
                .attr('x', 50)
                .attr('y', 50)
                .attr('height', 100)
                .attr('width', 100);
                
            var legendBoxWidth = 100;
            legend.selectAll('g').data(services)
              .enter()
              .append('g')
              .each(function(d, i) {
                var g = d3.select(this);
                g.append("rect")
                  .attr("x", i * legendBoxWidth + 5)
                  .attr("y", 10)
                  .attr("width", 10)
                  .attr("height", 10)
                  .attr("stroke", "black")
                  .attr("stroke-width", 0.5)
                  .style("fill", function() {
                      var toReturn = colors[String(d)];
                      if (!toReturn) {
                          return _this.defaultcolor;
                      }
                      return toReturn;
                  });
                
                g.append("text")
                  .attr("x", i * legendBoxWidth + 20)
                  .attr("y", 18)
                  .attr("height", 10)
                  .attr("width", legendBoxWidth)
                  .attr("title", "'" + d + "' service")
                  .style("fill", "black")
                  .text(d);
              });
        }
        
        // Add a very simple resize that duplicates this method with a new width/height
        if (this.useresize == 'true') {
            d3.select(window).on(this._padID("resize"), function() {
                _this.show(data);
            });
        }
        
        // Update our graph title with the proper count
        this.customTitle = "Graph of " + data.length + " Events:";
    },
    
    /**
     * Allow an external source to zoom this event monitor
     * This is especially useful when multiple event monitors need to have their zoom synchronized
     * @param domainMin date to use as the minimum for our X-Scale domain
     * @param domainMax date to use as the maximum for our X-Scale domain
     * @private
     */
    _externalZoom: function(domainMin, domainMax) {
        // If we have a proper D3 event we apply the scale/translate to our zoom object
        if (d3.event) {
            if (d3.event.scale) {
                this._ourzoom.scale(d3.event.scale);
            }
            if (d3.event.translate) {    
                this._ourzoom.translate(d3.event.translate);
            }
        }
        
        // If we received a domain min/max we set that into our X-Scale
        if (domainMin && domainMax) {
            this._ourxscale.domain([domainMin, domainMax]);
        }
        
        // Find our SVG element, update the axis, and redraw the circles as necessary
        var _this = this;
        var vis = d3.select("div#" + this.id + "div").select("svg");
        vis.select("g.axis").call(this._ourxaxis);
        vis.selectAll("circle")
            .attr("cx", function(d) { return _this._ourxscale(new Date(d.time)); });
    },
    
    /**
     * Convenience method to wrap append our ID to a name (such as an event, existing ID)
     *  to ensure it will be unique with other D3 graphs on the same page
     * @param base string to pad with our ID
     * @private
     */
    _padID: function(base) {
        return base + '.' + this.id;
    }
});