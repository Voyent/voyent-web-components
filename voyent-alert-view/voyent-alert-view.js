Polymer({
    is: 'voyent-alert-view',
    behaviors: [Voyent.AlertMapBehaviour,Voyent.AlertBehaviour],

    ready: function() {
        this._loadedAlert = null;
        this._myLocations = [];
    },

    /**
     * Updates the view with the last location of the alert associated
     * with the templateId and refreshes the current user's location.
     * @param templateId
     */
    updateView: function(templateId) {
        var _this = this;
        this._mapIsReady().then(function() {
            if (!templateId || typeof templateId !== 'string') {
                _this.fire('message-error','Unable to load template, id not provided.');
                return;
            }
            //Clear the map.
            _this.clearMap();
            //Fetch the alert and user locations.
            var promises = [];
            promises.push(_this._fetchAlertTemplate(templateId));
            promises.push(_this._fetchLocationRecord(templateId));
            promises.push(_this._fetchLocationRecord());
            Promise.all(promises).then(function(results) {
                //Build our LatLng object using the coordinates of the last location of the alert.
                var latLng = new google.maps.LatLng(
                    results[1].location.geometry.coordinates[1],
                    results[1].location.geometry.coordinates[0]
                );
                _this._drawAndLoadAlertTemplate(results[0],latLng);
                //Adjust the bounds and save the templateId for later.
                _this._adjustBoundsAndPan();
                _this._templateId = _this._loadedAlert.template.id;
            }).catch(function(error) {
                _this.fire('message-error', 'Issue refreshing the view: ' + (error.responseText || error.message || error));
            });
            _this._fetchMyLocations();
            //Reset the templateId as we'll re-set it later when we're ready.
            _this._templateId = null;
        });
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
        var _this = this, coordinates;
        this._mapIsReady().then(function() {
            if (!_this._templateId) { return; }
            _this._fetchLocationRecord(_this._templateId).then(function(location) {
                //Update the template coordinates, the label's position and adjust the bounds.
                coordinates = location.location.geometry.coordinates;
                _this._loadedAlert.selectedStack.marker.setPosition(new google.maps.LatLng(coordinates[1],coordinates[0]));
                _this.updateJSON();
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
        var coordinates = location.location.geometry.coordinates;
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
     * Updates the map bounds so the alert and user are in view and then pans the map.
     * @private
     */
    _adjustBoundsAndPan: function() {
        var bounds = new google.maps.LatLngBounds();
        if (this._loadedAlert) {
            var zones = this._loadedAlert.selectedStack.zones;
            for (var i=0; i<zones.length; i++) {
                bounds.extend(zones[i].shapeOverlay.getBounds().getNorthEast());
                bounds.extend(zones[i].shapeOverlay.getBounds().getSouthWest());
            }
        }
        if (this._userLocationMarker) { bounds.extend(this._userLocationMarker.getPosition()); }
        this._map.fitBounds(bounds);
        this._map.panToBounds(bounds);
    }
});
