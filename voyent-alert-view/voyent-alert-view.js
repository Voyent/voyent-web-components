Polymer({
    is: 'voyent-alert-view',
    behaviors: [Voyent.AlertMapBehaviour,Voyent.AlertBehaviour],

    ready: function() {
        this._loadedAlert = null;
        this._locationMarkers = [];
    },
    
    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
    },

    /**
     * Updates the view with the last location of the alert associated with the templateId.
     * If location records are included they will be drawn on the map.
     * @param templateId
     * @param locations
     */
    updateView: function(templateId,locations) {
        var _this = this;
        this._mapIsReady().then(function() {
            if (!templateId || typeof templateId !== 'string') {
                _this.fire('message-error','Unable to load template, id not provided');
                return;
            }
            //Clear the map.
            _this.clearMap();
            //Fetch the alert and user locations.
            var promises = [];
            promises.push(_this._fetchAlertTemplate(templateId));
            promises.push(_this._fetchLocationRecord(templateId));
            Promise.all(promises).then(function(results) {
                //Build our LatLng object using the coordinates of the last location of the alert.
                var latLng = new google.maps.LatLng(
                    results[1].location.geometry.coordinates[1],
                    results[1].location.geometry.coordinates[0]
                );
                _this._drawAndLoadAlertTemplate(results[0],latLng);
                _this._drawLocations(locations,true);
                _this._templateId = _this._loadedAlert.template.id;
            }).catch(function(error) {
                _this.fire('message-error', 'Issue refreshing the view: ' + (error.responseText || error.message || error));
            });
            //Reset the templateId as we'll re-set it later when we're ready.
            _this._templateId = null;
        });
    },

    /**
     * Loads the passed template into the view and optionally renders only the specified zone.
     * @param template
     * @param zoneId
     * @param locations
     */
    previewZoneFromTemplate: function(template,zoneId,locations) {
        if (!template || typeof template !== 'object') {
            this.fire('message-error','Unable to load template, template not provided');
            return;
        }
        //Ensure that the passed zoneId is valid. If not we will fallback to just drawing the inner zone of each stack.
        this._zoneIdToDisplay = null;
        this._foundZoneIdMatch = false;
        if (zoneId) {
            for (var i=0; i<template.geo.geometries.length; i++) {
                if (zoneId === template.geo.geometries[i].id) {
                    this._zoneIdToDisplay = zoneId;
                    break;
                }
            }
        }
        this.clearMap();
        this._drawAndLoadAlertTemplate(template);
        this._drawLocations(locations,false);
    },

    /**
     * Fetches the latest location of the current user and refreshes their position on the map.
     */
    refreshUserLocation: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            _this._fetchLocationRecord().then(_this._adjustBoundsAndPan.bind(_this)).catch(function(error) {
                _this.fire('message-error', 'Issue drawing user\'s location: ' +
                                             (error.responseText || error.message || error));
            });
        });
    },

    /**
     * Fetches the latest location of the currently loaded alert and refreshes the position on the map.
     */
    refreshAlertLocation: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            if (!_this._templateId) { return; }
            _this._fetchLocationRecord(_this._templateId).then(function(location) {
                //Update the template coordinates, the label's position and adjust the bounds.
                var pos = new google.maps.LatLng(location.location.geometry.coordinates[1],location.location.geometry.coordinates[0]);
                if (_this._loadedAlert.template.marker) {
                    _this._loadedAlert.template.calculateRelativeStackPositions(_this._loadedAlert.template.marker.getPosition());
                    _this._loadedAlert.template.marker.setPosition(pos);
                }
                else if (_this._loadedAlert.template.zoneStacks.length && _this._loadedAlert.template.zoneStacks[0].marker) {
                    _this._loadedAlert.template.calculateRelativeStackPositions(_this._loadedAlert.template.zoneStacks[0].marker.getPosition());
                }
                else { return; }
                _this._loadedAlert.template.moveStacksRelativeToPosition(pos);
                _this._adjustBoundsAndPan();
            }).catch(function(error) {
                _this.fire('message-error', 'Issue refreshing the alert\'s location: ' +
                           (error.responseText || error.message || error));
            });
        });
    },

    //******************PRIVATE API******************

    /**
     * Draws a user marker on the map based on the passed location data.
     * @param location
     * @private
     */
    _drawUser: function(location) {
        if (!location) { return; }
        var coordinates = location.location ? location.location.geometry.coordinates : location.geometry.coordinates;
        //Check if we already have a user location drawn on the map.
        if (this._userLocationMarker) { //Update the existing instance.
            this._userLocationMarker.setPosition(new google.maps.LatLng(coordinates[1],coordinates[0]));
        }
        else {
            this._userLocationMarker = new google.maps.Marker({
                position: new google.maps.LatLng(coordinates[1],coordinates[0]),
                map: this._map,
                draggable: false,
                icon: this.pathtoimages+'/img/user_marker.png'
            });
        }
    },

    /**
     * Draws user markers on the map based on the passed location data.
     * @param locations
     * @param useMarkerIcon
     * @private
     */
    _drawLocations: function(locations,useMarkerIcon) {
        if (!locations) { return; }
        this._locationMarkers = [];
        for (var i=0; i<locations.length; i++) {
            //We should always only have one mobile location.
            if (locations[i].properties.vras.type === 'mobile') {
                this._drawUser(locations[i]);
                continue;
            }
            this._locationMarkers.push(new google.maps.Marker({
                position: new google.maps.LatLng(
                    locations[i].geometry.coordinates[1],locations[i].geometry.coordinates[0]
                ),
                map: this._map,
                draggable: false,
                icon: useMarkerIcon ? this._MY_LOCATION_ICON_INACTIVE : this.pathtoimages+'/img/user_marker.png'
            }));
        }
    },

    /**
     * Clears user markers from the map.
     * @private
     */
    _clearLocations: function() {
        for (var i=0; i<this._locationMarkers.length; i++) {
            this._locationMarkers[i].setMap(null);
        }
        this._locationMarkers = [];
    },

    /**
     * Adds a listener for the fullscreen event so that we can toggle the readonly state on the map.
     * @private
     */
    _addFullscreenListener: function() {
        var _this = this;
        // This event is browser prefixed so we must listen to multiple events
        document.addEventListener('fullscreenchange', fullScreenListener);
        document.addEventListener('webkitfullscreenchange', fullScreenListener);
        document.addEventListener('mozfullscreenchange', fullScreenListener);
        function fullScreenListener() {
            var isFullScreen = document['fullScreen'] || document['webkitIsFullScreen'] || document['mozFullScreen'];
            if (isFullScreen) {
                _this._map.setOptions({mapTypeControl:true,zoomControl:true,draggable:true,disableDoubleClickZoom:false});
            }
            else {
                _this._map.setOptions({mapTypeControl:false,zoomControl:false,draggable:false,disableDoubleClickZoom:true});
            }
        }
    }
});
