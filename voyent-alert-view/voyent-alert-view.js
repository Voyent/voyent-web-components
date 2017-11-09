Polymer({
    is: 'voyent-alert-view',
    behaviors: [Voyent.AlertMapBehaviour,Voyent.AlertBehaviour],

    ready: function() {
        this._loadedAlert = null;
        this._myLocations = [];
    },
    
    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
    },

    /**
     * Updates the view with the last location of the alert associated with the templateId and refreshes the current
     * user's location. The locationNames are included so that we only show the relevant locations on the map.
     * @param templateId
     * @param locationNames
     */
    updateView: function(templateId,locationNames) {
        var _this = this;
        this._mapIsReady().then(function() {
            if (!templateId || typeof templateId !== 'string') {
                _this.fire('message-error','Unable to load template, id not provided');
                return;
            }
            _this.locationNames = locationNames || [];
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
    }
});
