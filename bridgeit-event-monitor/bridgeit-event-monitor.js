Polymer({

    is: "bridgeit-event-monitor",
    
    /**
     * Display a marble style graph based on the passed metric data
     * @param data array of the metric events to show on the graph
     */
    show: function(data) {
        var _this = this;
        var vis = d3.select("#eventmonitorsvg");
        var PADDING = 20,
            CIRCLE_RADIUS = 10;
            WIDTH = parseInt(vis.style("width"))-PADDING,
            HEIGHT = parseInt(vis.style("height")),
            DEFAULT_COLOR = "orange";
            
        // Clear our old graph first and reset the cursor
        vis.selectAll("*").remove();
        vis.style("cursor", null);
        
        // Before progressing check if we even have data to graph
        // If we don't we'll disable zoom/drag and show an error message
        if (typeof data == "undefined" || data == null || data.length == 0) {
            console.log("No data was passed to event monitor graph.");
            
            vis.call(d3.behavior.zoom().on("zoom", null));
            vis.call(d3.behavior.drag().on("drag", null));
            
            vis.append("svg:g").attr("class", "axis");
            vis.append("text").text("No event data was found, please try again.")
                .attr("x", PADDING)
                .attr("y", HEIGHT/2)
                .attr("fill", "red");
            
            return;
        }
        
        // All good, we'll be graphing!
        console.log("Going to graph " + data.length + " points for event monitor.");
        
        // Setup our colors
        var colors = {};
        colors['query'] = "red";
        colors['storage'] = "purple";
        colors['metrics'] = "yellow";
        colors['locate'] = "blue";
        colors['docs'] = "green";
        colors['action'] = "brown";
        colors['eventhub'] = "aqua";
        
        // Generate a list of services used from the data
        // This is a bit complex, but we loop through our data and look for unique services
        var services = [];
        var addCurrent;
        for (i = 0; i < data.length; i++) {
            addCurrent = false;
            // Add the first service automatically
            if (services.length == 0) {
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
        })]).range([PADDING, WIDTH-PADDING]);
        
        // Use the scale to make an axis
        xAxis = d3.svg.axis().scale(xScale)
                    .orient("bottom")
                    .tickPadding(5);
        
        // Vertically center the graph
        vis.append("svg:g")
            .attr("class", "axis")
            .attr("transform", "translate(0," + (HEIGHT/2) + ")")
            .call(xAxis);
            
        // Add zoom functionality
        vis.call(d3.behavior.zoom()
            .x(xScale)
            .on("zoom", function() {
                vis.select("g.axis").call(xAxis);
                vis.selectAll("circle")
                    .attr("cx", function(d) { return xScale(new Date(d.time)) });
            })
            .on("zoomstart", function() {
                vis.style("cursor", "zoom-in");
            })
            .on("zoomend", function() {
                vis.style("cursor", null);
            })
        );
        
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
        
        // Draw a circle for every piece of data
        vis.selectAll("circle.line")
            .data(data)
            .enter().append("circle")
            .attr("cy", HEIGHT/2)
            .attr("cx", function(d) { return xScale(new Date(d.time)) })
            .attr("r", CIRCLE_RADIUS)
            .attr("stroke", "black")
            .attr("stroke-width", 1)
            .attr("cursor", "pointer")
            .attr("title", function (d) { return new Date(d.time); })
            .style("fill", function(d) {
                var toReturn = colors[d.service];
                if (!toReturn) {
                    return DEFAULT_COLOR;
                }
                return toReturn; 
            })
            .on("click", function(d, i) {
                // Check if we're re-clicking the same circle, in which case we want to hide the details
                // This will basically function as a toggle
                if (d == _this.clickedData) {
                    _this.clickedData = null;
                    _this.clickedDataFormatted = null;
                    document.getElementById('eventDetails').style.display = "none";
                    return;
                }
                
                // Otherwise set our data object for display on the page and show the details
                _this.clickedData = d;
                _this.clickedDataFormatted = JSON.stringify(d.data);
                document.getElementById('eventDetails').style.display = "inline";
            });
        
        // Add a legend showing service color and corresponding name
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
                      return DEFAULT_COLOR;
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
        
        // Add a very simple resize that duplicates this method with a new width/height
        d3.select(window).on('resize', function() {
            _this.show(data);
        });
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