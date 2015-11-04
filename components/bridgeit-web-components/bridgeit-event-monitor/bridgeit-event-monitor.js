Polymer({

    is: "bridgeit-event-monitor",
    
    properties: {
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
         * Defines the left padding of the graph inside the SVG element
         * @default 20
         */
        padding: { type: Number, value: 20 },
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
    },
    
    /**
     * Display a marble style graph based on the passed metric data
     * @param data array of the metric events to show on the graph
     */
    show: function(data) {
        var _this = this;
        var vis = d3.select("#eventmonitorsvg");
        
        // Set our basic width/height and then calculate the result without units
        vis.attr("width", this.width);
        vis.attr("height", this.height);
        var calcWidth = parseInt(vis.style("width"))-this.padding;
        var calcHeight = parseInt(vis.style("height"));
        
        // Sizing minimum
        if (calcWidth < 100 && window.innerWidth && window.innerWidth > 500) {
            calcWidth = window.innerWidth - 400;
        }
            
        // Clear our old graph first and reset the cursor
        vis.selectAll("*").remove();
        vis.style("cursor", null);
        
        // Before progressing check if we even have data to graph
        // If we don't we'll disable zoom/drag and show an error message
        if (typeof data === "undefined" || data === null || data.length === 0) {
            console.log("No data was passed to event monitor graph.");
            
            this.customTitle = null;
            
            vis.call(d3.behavior.zoom().on("zoom", null));
            vis.call(d3.behavior.drag().on("drag", null));
            
            vis.append("svg:g").attr("class", "axis");
            vis.append("text").text("No event data was found, please try again.")
                .attr("x", this.padding)
                .attr("y", calcHeight/2)
                .attr("fill", "red");
            
            return;
        }
        
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
        xScale = d3.time.scale().domain([d3.min(data, function(d) {
            return new Date(d.time);
        }), d3.max(data, function(d) {
            return new Date(d.time);
        })]).range([this.padding, calcWidth-this.padding]);
        
        // Use the scale to make an axis
        xAxis = d3.svg.axis().scale(xScale)
                    .orient("bottom")
                    .tickPadding(5);
        
        // Vertically center the graph
        vis.append("svg:g")
            .attr("class", "axis")
            .attr("transform", "translate(0," + (calcHeight/2) + ")")
            .call(xAxis);
            
        // Add zoom functionality
        if (this.usezoom == 'true') {
            vis.call(d3.behavior.zoom()
                .x(xScale)
                .on("zoom", function() {
                    vis.select("g.axis").call(xAxis);
                    vis.selectAll("circle")
                        .attr("cx", function(d) { return xScale(new Date(d.time)); });
                })
                .on("zoomstart", function() {
                    vis.style("cursor", "zoom-in");
                })
                .on("zoomend", function() {
                    vis.style("cursor", null);
                })
            );
        }
        else {
            vis.call(d3.behavior.zoom().on("zoom", null));
            vis.call(d3.behavior.zoom().on("zoomstart", null));
            vis.call(d3.behavior.zoom().on("zoomend", null));
        }
        
        if (this.usedrag == 'true') {
            // Customize our drag functionality
            vis.call(d3.behavior.drag()
                .on("dragstart", function() {
                    vis.style("cursor", "move");
                    d3.select("body").style("cursor", "move");
                })
                .on("dragend", function() {
                    vis.style("cursor", null);
                    d3.select("body").style("cursor", null);                   
                })
            );
        }
        else {
            vis.call(d3.behavior.drag().on("drag", null));
            vis.call(d3.behavior.drag().on("dragstart", null));
            vis.call(d3.behavior.drag().on("dragend", null));
        }
        
        // Draw a circle for every piece of data
        var clickedCircle; // Used to track SVG object that was clicked
        vis.selectAll("circle.line")
            .data(data)
            .enter().append("circle")
            .attr("cy", calcHeight/2)
            .attr("cx", function(d) { return xScale(new Date(d.time)); })
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
            .on("click", function(d, i) {
                if (_this.useclickable == 'true') {
                    // First we restore any previously clicked circle to the normal radius
                    if (_this.clickedCircle) {
                        var old = d3.select(_this.clickedCircle);
                        old.attr("r", _this.circleradius);
                        old.classed("clickedCircle", false);
                    }
                        
                    // Check if we're re-clicking the same circle, in which case we want to hide the details
                    // This will basically function as a toggle
                    if (d == _this.clickedData) {
                        _this.clickedData = null;
                        _this.clickedDataFormatted = null;
                        document.getElementById('eventDetails').style.display = "none";
                        
                        return;
                    }
                    
                    // Otherwise set our data object for display on the page and show the details
                    var sel = d3.select(this);
                    sel.attr("r", _this.circleradius*2);
                    sel.classed("clickedCircle", true);
                    _this.clickedCircle = this;
                    _this.clickedData = d;
                    _this.clickedDataFormatted = JSON.stringify(d.data);
                    document.getElementById('eventDetails').style.display = "inline";
                }
            })
            .on("mouseover", function(d, i) {
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
            .on("mouseout", function(d, i) {
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
            d3.select(window).on('resize', function() {
                _this.show(data);
            });
        }
        
        // Update our graph title with the proper count
        this.customTitle = "Graph of " + data.length + " Events:";
    },
    
    //******************PRIVATE API******************
    
    /**
     * Hide our event detail data panel, which would be shown upon clicking on a graph element
     * @private
     */
    _hideData: function() {
        document.getElementById('eventDetails').style.display = "none";
    },
});