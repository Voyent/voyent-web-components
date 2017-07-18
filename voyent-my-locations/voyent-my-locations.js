Polymer({
    is: 'voyent-my-locations',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    ready: function() {
        //Type options for drop-down menus
        this._locationTypes = ['home','business','school','other'];
        //An _id mapped container of all locations.
        this._locations = {};
        //The location that is currently active in the editor (infoWindow is displayed).
        this._loadedLocationData = null;
        //Since all changes are transient before they save we have these lists
        //to flag locations that require a db call once they hit save.
        this._locationsToUpdate = [];
        this._locationsToDelete = [];
    },

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function () {
        var _this = this;
        //Only enable the marker when we are logged in.
        this._drawingManager.setOptions({
            "drawingControlOptions":{
                "drawingModes":['marker'],
                "position":google.maps.ControlPosition.TOP_RIGHT}
        });
        //Initialize infoWindow object for later.
        this._infoWindow = new google.maps.InfoWindow();
        //Fetch the realm region and the previously created locations.
        this._fetchRealmRegion();
        this._fetchLocations();
        //Close the infoWindow when clicking on the map.
        google.maps.event.addListener(this._map, "click", function() {
            _this._infoWindow.close();
        });
    },

    /**
     * Fetches the existing fixed location records.
     * @returns {*}
     * @private
     */
    _fetchLocations: function() {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var query = {"location.properties.trackerId":{"$exists":false},
                         "location.properties.vras.label":{"$exists":true},
                         "location.properties.vras.type":{"$exists":true}};
            voyent.locate.findLocations({realm:_this.realm,account:_this.account,query:query}).then(function(locations) {
                //Clear the map of any previously drawn entities and draw the new locations.
                _this._clearMap();
                _this._drawLocations(locations);
                resolve();
            }).catch(function (error) {
                reject(error);
            });
        });
    },

    /**
     * Draws the passed locations on the map.
     * @param locations
     * @private
     */
    _drawLocations: function(locations) {
        for (var i=0; i<locations.length; i++) {
            //Create the location marker and build our "locationData" object.
            var marker = new google.maps.Marker({
                position: new google.maps.LatLng(locations[i].location.geometry.coordinates[1],
                                                 locations[i].location.geometry.coordinates[0]),
                map: this._map,
                draggable: true
            });
            this._locations[locations[i]._id] = {"location":locations[i], "marker":marker};
            this._setupMapListeners(this._locations[locations[i]._id]);
        }
        console.log('_locations',Object.keys(this._locations).length);
    },

    /**
     * Triggered whenever the user clicks the save button, fires the save and
     * delete calls based on changes made since component load or last save.
     * @private
     */
    _saveChanges: function() {
        //It's possible that the user edited a location and then later decided to
        //delete it so in these cases make sure we don't bother updating it.
        for (var i=this._locationsToUpdate.length-1; i>=0; i--) {
            if (this._locationsToDelete.indexOf(this._locationsToUpdate[i]) > -1) {
                console.log('Location was deleted after editing, splicing...');
                this.splice('_locationsToUpdate',i,1);
            }
        }
        console.log('_locationsToUpdate',this._locationsToUpdate.length);
        console.log('_locationsToDelete',this._locationsToDelete.length);
        //Save and delete the locations that we're marker respectively.
        this._saveLocations();
        this._removeLocations();
    },

    /**
     * Triggered whenever the user clicks the cancel button, reverts all changes made since component load or last save.
     * @private
     */
    _cancelChanges: function() {
        this._fetchLocations();
    },

    /**
     * Clears the map of all drawn locations.
     * @private
     */
    _clearMap: function() {
        for (var location in this._locations) {
            if (!this._locations.hasOwnProperty(location)) { continue; }
            this._locations[location].marker.setMap(null);
        }
        this._locations = {};
    },

    /**
     * Saves all locations that have been modified since component load or last save.
     * @private
     */
    _saveLocations: function() {
        var _this = this, locationData, func;
        //Loop backwards since we're splicing.
        for (var i=this._locationsToUpdate.length-1; i>=0; i--) {
            locationData = this._locationsToUpdate[i];
            (function(locationData) {
                func = locationData.location._id ? 'updateFixedLocation' : 'updateLocation';
                voyent.locate[func]({account:_this.account,realm:_this.realm,id:locationData.location._id,
                                     location:locationData.location}).then(function(res) {
                    if (!locationData.location._id) {
                        locationData.location._id = res.uri.split("/").pop();
                    }
                    //Don't use i to splice because it may change as we splice out other locations.
                    _this.splice('_locationsToUpdate',_this._locationsToUpdate.indexOf(locationData),1);
                }).catch(function (error) {
                    _this.fire('message-error', 'Issue saving location: ' +
                                                locationData.location.location.properties.vras.label +
                                                ' (' + locationData.location.location.properties.vras.type + ')' +
                                                ' : ' + (error.responseText || error.message || error));
                    //Don't splice the _locationsToUpdate array on failure so the
                    //request will be attempted again the next time they save.
                });
            })(locationData)
        }
    },

    /**
     * Removes all locations that have been deleted since component load or last save.
     * @private
     */
    _removeLocations: function() {
        var _this = this, locationData;
        //Loop backwards since we're splicing.
        for (var i=this._locationsToDelete.length-1; i>=0; i--) {
            locationData = this._locationsToDelete[i];
            (function(locationData) {
                voyent.locate.deleteLocation({account:_this.account,realm:_this.realm,id:
                                              locationData.location._id}).then(function() {
                //Don't use i to splice because it may change as we splice out other locations.
                _this.splice('_locationsToDelete',_this._locationsToDelete.indexOf(locationData),1);
                }).catch(function (error) {
                    _this.fire('message-error', 'Issue deleting location: ' +
                               locationData.location.location.properties.vras.label +
                               ' (' + locationData.location.location.properties.vras.type + ')' +
                               ' : ' + (error.responseText || error.message || error));
                    //It wasn't deleted so re-add it to the map.
                    locationData.marker.setMap(_this._map);
                    _this._locations[locationData.location._id] = locationData;
                    _this.splice('_locationsToDelete',_this._locationsToDelete.indexOf(locationData),1);
                });
            })(locationData)
        }
    },

    /**
     * Whenever a property is edited we need to be sure to flag the associated location for updating.
     * @private
     */
    _flagLocationForUpdating: function() {
        if (this._locationsToUpdate.indexOf(this._loadedLocationData) === -1) {
            this._locationsToUpdate.push(this._loadedLocationData);
        }
    },

    /**
     * Triggered whenever the user clicks the trash icon in the infoWindow.
     * Removes the location from the map and flags it for deletion.
     * @private
     */
    _flagLocationForRemoval: function() {
        this._infoWindow.close();
        this._loadedLocationData.marker.setMap(null);
        this._locationsToDelete.push(this._loadedLocationData);
        delete this._locations[this._loadedLocationData.location._id];
        this._loadedLocationData = null;
    },

    /**
     * Displays an infoWindow that is triggered when clicking on the location markers.
     * @param locationData
     * @private
     */
    _displayInfoWindow: function(locationData) {
        var _this = this;
        setTimeout(function() {
            _this._loadedLocationData = locationData;
            _this.$.infoWindow.removeAttribute('hidden');
            _this._infoWindow.open(_this._map,locationData.marker);
            _this._infoWindow.setContent(_this.$.infoWindow);
        },0);
    },

    /**
     * Initialize the listeners for drawing a new location on the map.
     * @private
     */
    _setupDrawingListeners: function () {
        var _this = this;
        var marker, position;
        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', function (oce) {
            marker = oce.overlay; position = marker.getPosition();
            if (!google.maps.geometry.poly.containsLocation(position, _this._areaRegion.polygon)) {
                _this.fire('message-info', 'The Location must be inside your region.');
                oce.overlay.setMap(null);
                return;
            }
            //Only draw the marker when they confirm the Location details.
            oce.overlay.setMap(null);
            _this._openCustomDialog('Please enter the Location details', ['_locationLabel','_locationType'], function () {
                //Display the marker, build the location record, add the required listeners and flag it for updating.
                oce.overlay.setMap(_this._map);
                var latLng = marker.getPosition();
                var locationData = {"location":{
                    "location": {
                        "geometry": { "type" : "Point", "coordinates" : [latLng.lng(),latLng.lat()] },
                        "properties": {
                            "vras": {
                                "label":_this._locationLabel,
                                "type":_this._locationType
                            }
                        }
                    }
                },"marker":marker};
                _this._locations[locationData.location._id] = locationData;
                _this._setupMapListeners(locationData);
                _this._locationsToUpdate.push(locationData);
            });
            //Exit drawing mode.
            _this._drawingManager.setDrawingMode(null);
        });
        //When the escape key is pressed exit drawing mode.
        window.addEventListener('keydown', function (event) {
            if (event.which === 27) {
                if (_this._drawingManager.getDrawingMode() !== null) {
                    _this._drawingManager.setDrawingMode(null);
                }
            }
        });
    },

    /**
     * Initialize google map listeners for moving and clicking on the locations.
     * @param locationData
     * @private
     */
    _setupMapListeners: function(locationData) {
        var _this = this;
        //Prevent the Location from being dragged outside of the realm region.
        google.maps.event.addListener(locationData.marker,'drag',function(e) {
            if (!google.maps.geometry.poly.containsLocation(e.latLng,_this._areaRegion.polygon)) {
                locationData.marker.setPosition(_this._previousDragPosition);
                return;
            }
            _this._previousDragPosition = e.latLng;
        });
        //Update the coordinates on the location record and flag the location for updating after it's dragged.
        google.maps.event.addListener(locationData.marker,'dragend',function() {
            var latLng = locationData.marker.getPosition();
            locationData.location.location.geometry.coordinates = [latLng.lng(),latLng.lat()];
            if (_this._locationsToUpdate.indexOf(locationData) === -1) {
                _this._locationsToUpdate.push(locationData);
            }
        });
        //Display infoWindow on location marker click.
        google.maps.event.addListener(locationData.marker,'click',function() {
            _this._displayInfoWindow(locationData);
        });
    },

    /**
     * Proper-case the passed type.
     * @param type
     * @returns {string}
     * @private
     */
    _returnTypeLabel: function(type) {
        return type ? (type.charAt(0).toUpperCase() + type.slice(1)) : type;
    }
});