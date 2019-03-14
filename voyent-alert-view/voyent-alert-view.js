Polymer({
    is: 'voyent-alert-view',
    behaviors: [Voyent.AlertMapBehaviour,Voyent.AlertBehaviour],


    properties: {
        /**
         * Indicates which mode the component is in. Valid values are `notification`, `view`, `preview`, and `response`.
         */
        mode: { type: String },
        /**
         * Indicates whether the component is loaded on mobile.
         */
        isMobile: { type: Boolean, value: false },
        /**
         * Indicates whether the component is in portrait mode. Applicable only when isMobile is true.
         */
        isPortrait: { type: Boolean, value: false, observer: '_isPortraitChanged' }

    },

    observers: [
        '_alertHistoryChanged(_alertHistory)',
        '_notificationFilterChanged(_notificationFilter)',
        '_mobileLocationEnabledChanged(_mobileLocationEnabled)'
    ],

    ready: function() {
        this._loadedAlert = null;
        this.set('_myLocations', []);
        this.set('_answers', []);
        this._LOCATION_TYPE_COUNT_LEGEND_ID = 'locationTypesCount';
        this._LOCATION_TYPE_STATE_LEGEND_ID = 'locationTypesState';
        this._RESPONSE_ANSWER_LEGEND_ID = 'responseAnswer';
        this._CURRENT_LOCATION_BUTTON_ID = 'currentLocationButton';
        this._addNativeAppStateListeners();
    },

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        var _this = this;
        this._fetchRealmRegion();
        // Add fullscreen control + esc listener
        this._addFullscreenButton();
        // Add current location button for notification detail view
        this._addMobileLocationButton();
        window.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _this._isFullscreenMode) {
                _this._toggleFullscreenContainer();
            }
        });
    },

    /**
     * View the alert associated with the templateId at its last known location.
     * If location records are included they will be drawn on the map.
     * @param templateId - The id of the alert template to be drawn.
     * @param affectedLocations - A list of affected locations.
     */
    viewAlertDetail: function(templateId,affectedLocations) {
        var _this = this;
        this.disableFullscreenMode(); // Always load the map as a windowed component
        this._mapIsReady().then(function() {
            if (!templateId || typeof templateId !== 'string') {
                _this.fire('message-error','Unable to load template, id not provided');
                return;
            }
            _this.clearMap();
            // Fetch the alert template, its current location and the user's "my locations"
            var promises = [];
            promises.push(_this._fetchAlertTemplate(templateId));
            promises.push(_this._fetchLocationRecord(templateId));
            promises.push(_this._fetchMyLocations());
            // First create a list of affected location ids. We will draw all locations but
            // will use this list to ensure we only pan the map on the affected locations
            _this._affectedLocationIds = [];
            // Then create a list of affected stack ids. These are the zone stacks which have locations inside one
            // of their zones. We will use this list to help determine how the map should be panned. If there
            // are no affected stack ids then it means the notification was triggered by a fallback zone.
            _this._affectedStackIds = [];
            if (affectedLocations && affectedLocations.length) {
                _this._affectedLocationIds = affectedLocations.map(function(obj) {
                    return obj.properties.vras.id;
                });
                _this._affectedStackIds = affectedLocations.reduce(function(result, obj) {
                    if (typeof obj.properties.vras.insideStackId !== 'undefined') {
                        result.push(obj.properties.vras.insideStackId);
                    }
                    return result;
                }, []);
            }
            Promise.all(promises).then(function(results) {
                var alert = results[0];
                var alertLocation = results[1];
                var myLocations = results[2];
                //First clear the map if we have an alert loaded already.
                if (_this._loadedAlert) {
                    _this.clearMap();
                }
                if (alert) {
                    //Build our LatLng object using the coordinates of the last location of the alert.
                    var latLng = null;
                    if (alert.geo) {
                        latLng = new google.maps.LatLng(
                            alertLocation.location.geometry.coordinates[1],
                            alertLocation.location.geometry.coordinates[0]
                        );
                    }
                    _this._drawAndLoadAlertTemplate(alert,latLng);
                    _this._templateId = _this._loadedAlert.template.id;
                }
                else {
                    _this.fire('message-info','Unable to find alert geography');
                }
                _this._drawLocations(myLocations);
                _this._toggleEditableMap(false);
                setTimeout(function() {
                    _this._adjustBoundsAndPan();
                },0);
            }).catch(function(error) {
                console.error(error);
                _this.fire('message-error', 'Issue refreshing the view: ' + (error.responseText || error.message || error));
            });
            //Reset the templateId as we'll re-set it later when we're ready.
            _this._templateId = null;
        });
    },

    /**
     * View the alert associated with the templateId at its last known location.
     * If location records are included they will be drawn on the map.
     * @param alert - The alert template to be drawn.
     * @param locations - An optional array of location records to be drawn.
     * @param alertHistory - The notification history of the alert.
     */
    viewAlert: function(alert,locations,alertHistory) {
        var _this = this;
        this.disableFullscreenMode(); // Always load the map as a windowed component
        // Reset some state
        this._zoneIdToDisplay = null;
        this._foundZoneIdMatch = false;
        // Wait for map before proceeding
        this._mapIsReady().then(function() {
            if (!alert || typeof alert !== 'object') {
                _this.fire('message-error','Unable to load template, template not provided.');
                return;
            }
            _this.clearMap();
            //Fetch the alert template, its current location and the user locations (incl. mobile).
            _this._fetchLocationRecord(alert._id).then(function(alertLocation) {
                //First clear the map if we have an alert loaded already.
                if (_this._loadedAlert) {
                    _this.clearMap();
                }
                //Build our LatLng object using the coordinates of the last location of the alert.
                var latLng = null;
                if (alert.geo) {
                    latLng = new google.maps.LatLng(
                        alertLocation.location.geometry.coordinates[1],
                        alertLocation.location.geometry.coordinates[0]
                    );
                }
                _this._drawAndLoadAlertTemplate(alert,latLng);
                _this._templateId = _this._loadedAlert.template.id;
                // Draw the locations and ensure the map can be panned
                _this._drawLocations(locations);
                _this._toggleEditableMap(true);
                // Set the location types legend history
                _this.set('_alertHistory',alertHistory);
            }).catch(function(error) {
                console.error(error);
                _this.fire('message-error', 'Issue refreshing the view: ' + (error.responseText || error.message || error));
            });
            //Reset the templateId as we'll re-set it later when we're ready.
            _this._templateId = null;
        });
    },

    /**
     * Loads the passed template into the view and optionally renders only the specified zone.
     * @param template - The template JSON.
     * @param zoneId - The (optional) zone id that will be rendered rather than every zone.
     * @param locations - An array of locations to be drawn.
     * @param alertHistory - The notification history for the zone, this OR notificationFilter should be provided.
     * @param notificationFilter - The notification filter settings for the zone, this OR notificationFilter should be provided.
     */
    previewZoneFromTemplate: function(template,zoneId,locations,alertHistory,notificationFilter) {
        if (!template || typeof template !== 'object') {
            this.fire('message-error','Unable to load template, template not provided');
            return;
        }
        // Ensure that the passed zoneId is valid. If not we will fallback to just drawing the inner zone of each stack.
        this._zoneIdToDisplay = null;
        this._foundZoneIdMatch = false;
        if (zoneId) {
            if (zoneId === this._FALLBACK_ZONE_ID && template.properties[this._FALLBACK_ZONE_ID].enabled) {
                // Ensure we don't zoom in too far when panning the map on a location inside the fallback zone.
                this._map.setOptions({maxZoom:this._maxZoom});
                this._zoneIdToDisplay = this._FALLBACK_ZONE_ID;
            }
            else {
                for (var i=0; i<template.geo.geometries.length; i++) {
                    if (zoneId === template.geo.geometries[i].id) {
                        this._zoneIdToDisplay = zoneId;
                        break;
                    }
                }
            }
        }
        // Draw the alert
        this.clearMap();
        this._drawLocations(locations, (alertHistory ? alertHistory : null));
        this._drawAndLoadAlertTemplate(template);
        this._map.setOptions({maxZoom:null});
        // Set the location types legend history and notification filter
        this.set('_alertHistory',alertHistory);
        this.set('_notificationFilter',notificationFilter);
    },

    /**
     * Fetches the latest location of the currently loaded alert and refreshes the position on the map.
     */
    refreshAlertLocation: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            if (!_this._templateId) { return; }
            _this._fetchLocationRecord(_this._templateId).then(function(location) {
                // Fallback zone only alert
                if (!_this._loadedAlert.template.zoneStacks.length) {
                    return;
                }
                //Update the template coordinates, the label's position and adjust the bounds.
                var pos = new google.maps.LatLng(location.location.geometry.coordinates[1],location.location.geometry.coordinates[0]);
                _this._loadedAlert.template.updateJSON();
                _this._loadedAlert.template.calculateRelativeStackPositions(_this._AlertTemplate.calculateCentroidFromJSON(_this._loadedAlert.template.json));
                if (_this._loadedAlert.template.marker) {
                    _this._loadedAlert.template.marker.setPosition(pos);
                }
                _this._loadedAlert.template.moveStacksRelativeToPosition(pos, true);
                // Don't adjust the map in view mode as the user may be panning the map.
                if (!_this.mode !== 'view' && !_this.mode !== 'response') {
                    _this._adjustBoundsAndPan();
                }
            }).catch(function(error) {
                _this.fire('message-error', 'Issue refreshing the alert\'s location: ' +
                           (error.responseText || error.message || error));
            });
        });
    },

    /**
     * Returns the center point of the alert.
     * @returns {lat: Number, lng: Number}
     */
    getAlertCenter: function() {
        if (this._loadedAlert && this._loadedAlert.template) {
            this._loadedAlert.template.updateJSON();
            return this._AlertTemplate.calculateCentroidFromJSON(this._loadedAlert.template.json).toJSON();
        }
    },

    /**
     * Toggles visibility of locations based on the provided location type.
     * @param locationType
     * @param visible
     */
    toggleLocationsForType: function(locationType,visible) {
        if (!this._myLocations || !this._myLocations.length) {
            return;
        }
        for (var i=0; i<this._myLocations.length; i++) {
            if (this._myLocations[i].type === locationType) {
                if (visible) {
                    this._myLocations[i].removeFromMap();
                }
                else {
                    this._myLocations[i].addToMap();
                }
            }
        }
    },

    /**
     * Toggles visibility of locations based on the provided endpoint type.
     * @param endpointType
     * @param visible
     */
    toggleLocationsForEndpoint: function(endpointType,visible) {
        if (!this._myLocations || !this._myLocations.length) {
            return;
        }
        for (var i=0; i<this._myLocations.length; i++) {
            if (this._myLocations[i].endpointType === endpointType) {
                if (visible) {
                    this._myLocations[i].removeFromMap();
                }
                else {
                    this._myLocations[i].addToMap();
                }
            }
        }
    },

    //******************PRIVATE API******************

    /**
     * Draws a mobile location marker on the map based on the passed coordinates.
     * @param lat
     * @param lng
     * @private
     */
    _drawMobileLocation: function(lat, lng) {
        if (typeof lat === 'number' && typeof lng === 'number') {
            if (this._mobileLocation) {
                this._mobileLocation.setLatLng(new google.maps.LatLng(lat, lng));
            }
            else {
                this._mobileLocation = new this._MobileLocationOverlay(new google.maps.LatLng(lat, lng));
            }
        }
    },

    /**
     * Draws user markers on the map based on the passed location data.
     * @param locations
     * @param alertHistory (optional)
     * @private
     */
    _drawLocations: function(locations, alertHistory) {
        // Reset our answers and saved locations
        this.set('_answers', []);
        this.set('_myLocations', []);
        
        var ourLocation, marker, i;
        
        // If we're drawing response section use our alertHistory for the map data
        // Otherwise use the passed locations
        if (this.mode === 'response' && alertHistory) {
            // First store our answers for use with the map legend
            if (alertHistory.acknowledgement && alertHistory.acknowledgement.answers) {
                for (i = 0; i < alertHistory.acknowledgement.answers.length; i++) {
                    if (alertHistory.acknowledgement.answers[i].requestLocation) {
                        this.push('_answers', alertHistory.acknowledgement.answers[i]);
                    }
                }
            }
            
            // Then if we have user responses map them out
            if (alertHistory.users) {
                for (var userLoop = 0; userLoop < alertHistory.users.length; userLoop++) {
                    var currentUser = alertHistory.users[userLoop];
                    
                    // Only map users who have a location and response answer that requested said location
                    if ((currentUser.location && currentUser.location.properties && currentUser.location.geometry) &&
                        (alertHistory.acknowledgement && currentUser.response && currentUser.response.answerId)) {
                        // Choose our color based on the answer
                        for (i = 0; i < alertHistory.acknowledgement.answers.length; i++) {
                            if (alertHistory.acknowledgement.answers[i].requestLocation &&
                                (alertHistory.acknowledgement.answers[i].id === currentUser.response.answerId)) {
                                ourLocation = currentUser.location;
                                
                                marker = new google.maps.Marker({
                                    position: new google.maps.LatLng(
                                        ourLocation.geometry.coordinates[1], ourLocation.geometry.coordinates[0]
                                    ),
                                    icon: { url: "https://maps.google.com/mapfiles/ms/icons/" + (alertHistory.acknowledgement.answers[i].color ? alertHistory.acknowledgement.answers[i].color : 'orange') + ".png" },
                                    map: this._map,
                                    draggable: false,
                                });
                                
                                this._addUserDetailsClickListener(marker, currentUser, alertHistory.acknowledgement.answers[i].text);
                                
                                // Store our drawn location
                                this.push('_myLocations',new this._MyLocation(
                                    ourLocation.properties.vras.id,
                                    ourLocation.properties.vras.name,
                                    ourLocation.properties.vras.type,
                                    marker,
                                    ourLocation.endpointType || null
                                ));                            
                            }
                        }
                    }
                }
                
                // Add a global map listener to close any info window when clicking outside the popup
                this._addUserDetailsCloseListener();
            }
        }
        else if (locations && locations.length) {
            for (i = 0; i < locations.length; i++) {
                if (locations[i] && locations[i].properties && locations[i].geometry) { // Ensure we have a valid location
                    ourLocation = locations[i];
                    
                    marker = new google.maps.Marker({
                        position: new google.maps.LatLng(
                            ourLocation.geometry.coordinates[1], ourLocation.geometry.coordinates[0]
                        ),
                        icon: (this.mode === 'notification' ? this._MY_LOCATION_ICON_INACTIVE : this._getIconByLocationType(ourLocation.properties.vras.type)),
                        map: this._map,
                        draggable: false,
                    });
                    
                    this._addFullscreenClickListener(marker);
                    
                    // Store our drawn location
                    this.push('_myLocations',new this._MyLocation(
                        ourLocation.properties.vras.id,
                        ourLocation.properties.vras.name,
                        ourLocation.properties.vras.type,
                        marker,
                        ourLocation.endpointType || null
                    ));
                }
            }
        }
    },
    
    applyResponseFilter: function(filter) {
        var filteredUsers = [];
        
        // Filter the map markers and hide as needed
        if (this._alertHistory && this._alertHistory.users && this._alertHistory.users.length > 0 && filter) {
            // First determine if the user has checked NO_RESPONSE, which we'll use later
            var selectedNoResponse = false;
            for (var checkLoop = 0; checkLoop < filter.length; checkLoop++) {
                if (filter[checkLoop].filter === 'NO_RESPONSE') {
                    selectedNoResponse = true;
                    break;
                }
            }
            
            // Now loop through our users and determine if their marker should be shown or not based on the filter
            for (var userLoop = 0; userLoop < this._alertHistory.users.length; userLoop++) {
                if (this._alertHistory.users[userLoop].response) {
                    // Figure out if the user passes the filter or not
                    var hideMarker = true;
                    for (var filterLoop = 0; filterLoop < filter.length; filterLoop++) {
                        if (typeof filter[filterLoop].filter.id !== 'undefined' &&
                            filter[filterLoop].filter.id === this._alertHistory.users[userLoop].response.answerId) {
                            filteredUsers.push(this._alertHistory.users[userLoop]);
                            
                            hideMarker = false;
                            break;
                        }
                    }
                    
                    // Then figure out which location the user has, and hide/show the marker as required
                    for (var locLoop = 0; locLoop < this._myLocations.length; locLoop++) {
                        if (this._myLocations[locLoop].id === this._alertHistory.users[userLoop].location.properties.vras.id) {
                            if (hideMarker) {
                                this._myLocations[locLoop].removeFromMap();
                            }
                            else {
                                this._myLocations[locLoop].addToMap();
                            }
                            
                            break;
                        }
                    }
                }
                // If we don't have a user response still consider the chance we want to see that marker
                else {
                    // We also want to still store the user as they match the filter
                    if (selectedNoResponse) {
                        filteredUsers.push(this._alertHistory.users[userLoop]);
                    }
                    
                    for (var locLoop = 0; locLoop < this._myLocations.length; locLoop++) {
                        if (this._myLocations[locLoop].id === this._alertHistory.users[userLoop].location.properties.vras.id) {
                            if (selectedNoResponse) {
                                this._myLocations[locLoop].addToMap();
                            }
                            else {
                                this._myLocations[locLoop].removeFromMap();
                            }
                            
                            break;
                        }
                    }
                }
            }
        }
        
        return filteredUsers;
    },

    /**
     * Updates the map bounds to include all zone stacks otherwise zooms on the region geography.
     * @private
     */
    _adjustBoundsAndPan: function() {
        var bounds = new google.maps.LatLngBounds(), boundsExtended = false;
        var zoneStacks = this._loadedAlert && this._loadedAlert.template
            ? this._loadedAlert.template.zoneStacks
            : [];
        if (this._loadedAlert && zoneStacks.length) {
            for (var i=0; i<zoneStacks.length; i++) {
                var outerZone = zoneStacks[i].getOutermostZone();
                if (outerZone) {
                    for (var j=0; j<outerZone.shapeOverlay.getPath().length; j++) {
                        bounds.extend(outerZone.shapeOverlay.getPath().getAt(j));
                        boundsExtended = true;
                    }
                }
            }
        }
        if (this.mode === 'notification' && this._extendBoundsForNotificationMode(bounds)) {
            boundsExtended = true;
        }
        // Only pan the map if the bounds were extended otherwise it
        // will try to pan to an empty bounds (middle of the sea)
        if (boundsExtended) {
            this._map.fitBounds(bounds);
            this._map.panToBounds(bounds);
            return;
        }
        // If we never panned the map then just zoom on the region
        this._zoomOnRegion();
    },

    /**
     * Adjusts the bounds further for the alert details view (mode === 'notification').
     * @param bounds
     * @returns {boolean} - Whether the bounds were extended.
     * @private
     */
    _extendBoundsForNotificationMode: function(bounds) {
        var boundsExtended = false;
        // If we were notified by a non-fallback zone then include the affected locations in
        // the map panning. We don't include them when being notified by a fallback zone to
        // prevent the map from panning too far from the region boundary and primary zone
        if (this._affectedStackIds && this._affectedStackIds.length) {
            for (var i=0; i<this._myLocations.length; i++) {
                if (this._affectedLocationIds.indexOf(this._myLocations[i].id) > -1) {
                    bounds.extend(this._myLocations[i].marker.getPosition());
                    boundsExtended = true;
                }
            }
        }
        else if (this._areaRegion && this._areaRegion.bounds) {
            // If we were notified by a fallback zone then include the region boundary in the map bounds
            bounds.extend(this._areaRegion.bounds.getNorthEast());
            bounds.extend(this._areaRegion.bounds.getSouthWest());
            boundsExtended = true;
        }
        // Include the mobile location in the map bounds if it is available
        if (this._mobileLocation && this._mobileLocation.visible && this._mobileLocation.latLng) {
            bounds.extend(this._mobileLocation.latLng);
            boundsExtended = true;
        }
        return boundsExtended;
    },

    /**
     * Adds the location types legend (with count) to the map.
     * @private
     */
    _addLocationTypesCountLegend: function() {
        this._addCustomControl(this._LOCATION_TYPE_COUNT_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Redraws the location types legend (with count) to the map.
     * @private
     */
    _redrawLocationTypesCountLegend: function() {
        this._redrawCustomControl(this._LOCATION_TYPE_COUNT_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Removes the location types legend (with count) from the map.
     * @private
     */
    _removeLocationTypesCountLegend: function() {
        this._removeCustomControl(this._LOCATION_TYPE_COUNT_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM)
    },
    
    /**
     * Adds the response answer legend to the map.
     * @private
     */
    _addResponseAnswerLegend: function() {
        this._addCustomControl(this._RESPONSE_ANSWER_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Redraws the response answer legend on the map.
     * @private
     */
    _redrawResponseAnswerLegend: function() {
        this._redrawCustomControl(this._RESPONSE_ANSWER_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Removes the response answer from the map.
     * @private
     */
    _removeResponseAnswerLegend: function() {
        this._removeCustomControl(this._RESPONSE_ANSWER_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM)
    },

    /**
     * Adds the location types legend (with state) to the map.
     * @private
     */
    _addLocationTypesStateLegend: function() {
        this._addCustomControl(this._LOCATION_TYPE_STATE_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Redraws the location types legend (with state) to the map.
     * @private
     */
    _redrawLocationTypesStateLegend: function() {
        this._redrawCustomControl(this._LOCATION_TYPE_STATE_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Removes the location types legend (with state) from the map.
     * @private
     */
    _removeLocationTypesStateLegend: function() {
        this._removeCustomControl(this._LOCATION_TYPE_STATE_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM)
    },

    /**
     * Adds the GPS/current location button to the map.
     * @private
     */
    _addMobileLocationButton: function() {
        var _this = this;
        // Can be used for testing this button on desktop
        /*window.vras = {
            lat: 51.08427,
            lng: -114.13062,
            getLocation: function() {
                this.lat = this.lat + 0.00010;
                this.lng = this.lng + 0.00010;
                util.fire('returnCurrentLocation', { lat: this.lat, lng: this.lng });
            },
        };*/
        if (this.mode === 'notification' && typeof vras !== 'undefined') {
            this._addCustomControl(
                this._CURRENT_LOCATION_BUTTON_ID,
                google.maps.ControlPosition.RIGHT_BOTTOM,
                this._toggleMobileLocationTracking.bind(this),
            function() {
                    _this._mobileLocationEnabled = false;
                    window.addEventListener('returnCurrentLocation', function(e) {
                        _this._drawMobileLocation(e.detail.lat, e.detail.lng);
                        // Pan on the original alert + the mobile location, only do
                        // this when requested so we don't pan the map when polling
                        if (_this._includeMobileLocationInPanning) {
                            _this._adjustBoundsAndPan();
                            _this._includeMobileLocationInPanning = false;
                        }
                    });
                    // Start with mobile location tracking enabled
                    _this._toggleMobileLocationTracking();
                }
            );
        }
    },

    /**
     * Toggles mobile location tracking on the map.
     * @private
     */
    _toggleMobileLocationTracking: function() {
        this.set('_mobileLocationEnabled',!this._mobileLocationEnabled);
        if (this._mobileLocationEnabled) {
            // Include the mobile location in the map panning once it's received from the device
            this._includeMobileLocationInPanning = true;
            // Get the location
            vras.getLocation();
            // Start polling the location position
            this._startMobileLocationPolling();
        }
        else {
            // Hide the location from the map
            this._mobileLocation.hide();
            // Stop polling the location position
            this._stopMobileLocationPolling();
            // Pan to the original alert
            this._adjustBoundsAndPan();
        }
    },

    /**
     * Manages selected styling on the mobile location button.
     * @param enabled
     * @private
     */
    _mobileLocationEnabledChanged: function(enabled) {
        var _this = this;
        // Select the custom control (+ '_cc')
        var currentLocationButton = this.querySelector('#'+this._CURRENT_LOCATION_BUTTON_ID+'_cc');
        // Wait for the button as it's not available when we first toggle the mobile location
        this._waitForCondition(
            function() {
                return !!_this.querySelector('#'+_this._CURRENT_LOCATION_BUTTON_ID+'_cc')
            },
            5000
        ).then(function() {
            currentLocationButton = _this.querySelector('#'+_this._CURRENT_LOCATION_BUTTON_ID+'_cc');
            if (currentLocationButton) {
                _this.toggleClass('selected', !!enabled, currentLocationButton);
                currentLocationButton.setAttribute('title',enabled ? 'Disable Location Tracking' : 'Enable Location Tracking')
            }
        }).catch(function() {});

    },

    /**
     * Starts mobile location polling.
     * @private
     */
    _startMobileLocationPolling: function() {
        this._mobileLocationPoller = setInterval(function() {
            vras.getLocation();
        },10000);
    },

    /**
     * Ends mobile location polling.
     * @private
     */
    _stopMobileLocationPolling: function() {
        clearInterval(this._mobileLocationPoller);
        this._mobileLocationPoller = null;
    },

    /**
     * Listeners for native app pause / resume events.
     * @private
     */
    _addNativeAppStateListeners: function() {
        var _this = this;
        window.addEventListener('voyent-pausing-native-app', function() {
            // Don't continue location polling when the app goes in the background (Android seems to do this)
            if (_this._mobileLocation && _this._mobileLocationPoller) {
                _this._stopMobileLocationPolling();
            }
        });
        window.addEventListener('voyent-resuming-native-app', function() {
            // If we have a mobile location then start polling updates for it again
            if (_this._mobileLocation && _this._mobileLocation.visible) {
                _this._startMobileLocationPolling();
            }
        });
    },

    /**
     * Returns the location marker image to use based on the passed location type.
     * @param locationType
     * @returns {string}
     * @private
     */
    _getIconByLocationType: function(locationType) {
        if (locationType === 'mobile') {
            return this.pathtoimages+'/img/circle.png';
        }
        else if (locationType === 'residential') {
            return this.pathtoimages+'/img/triangle_up.png';
        }
        return this.pathtoimages+'/img/square.png';
    },

    /**
     * Returns the location marker image to use based on the passed endpoint type.
     * @param endpointType
     * @returns {string}
     * @private
     */
    _getIconByEndpointType: function(endpointType) {
        if (endpointType === 'fcm') {
            return this.pathtoimages+'/img/triangle_down.png';
        }
        else if (endpointType === 'apns') {
            return this.pathtoimages+'/img/triangle_up.png';
        }
        else if (endpointType === 'mailto') {
            return this.pathtoimages+'/img/square.png';
        }
        else if (endpointType === 'sms') {
            return this.pathtoimages+'/img/circle.png';
        }
        return this.pathtoimages+'/img/donut.png';
    },

    /**
     * Toggle map panning, zooming and dragging.
     * @param editable
     * @private
     */
    _toggleEditableMap: function(editable) {
        this._map.setOptions({
            draggable: editable,
            disableDoubleClickZoom: !editable
        });
        var mapTypeControl = this['_' + this._MAP_TYPE_BUTTONS_ID];
        var zoomControl = this['_' + this._ZOOM_BUTTONS_ID];
        if (editable) {
            mapTypeControl.style.display = 'block';
            zoomControl.style.display = 'block';
            this._adjustBoundsAndPan();
        } else {
            mapTypeControl.style.display = 'none';
            zoomControl.style.display = 'none';
        }
    },

    /**
     * Returns a boolean indicating whether the passed `locationType` is enabled for the current notificationFilter.
     * @param locationType
     * @returns {boolean}
     * @private
     */
    _isLocationTypeEnabled: function(locationType) {
        if (this._notificationFilter) {
            var locationTypes = this._notificationFilter.locationTypes || ['all'];
            if (!locationTypes.length) {
                return false;
            }
            else if (locationTypes.indexOf('all') > -1) {
                return true;
            }

            if (locationType === 'mobile' && locationTypes.indexOf('mobile') > -1) {
                return true;
            }
            else if (locationType === 'residential' && locationTypes.indexOf('residential') > -1) {
                return true;
            }
            else if (locationType === 'other' && locationTypes.indexOf('other') > -1) {
                return true;
            }
            return false;
        }
        return true;
    },

    /**
     * Returns either an `enabled` or `disabled` class to be used for the location type state value.
     * @param locationType
     * @returns {string}
     * @private
     */
    _getLocationTypeClass: function(locationType) {
        return this._isLocationTypeEnabled(locationType) ? 'enabled' : 'disabled';
    },

    /**
     * Show an info message to the user when they click on the mobile location type help icon.
     * @private
     */
    _showMobileLocationTypeHelp: function() {
        this.fire('message-info','Mobile locations are not displayed on the map in preview mode because their position cannot be determined until alert activation.');
    },

    /**
     * Monitors the `_alertHistory` property and toggles the visibility of the location types legend (with count).
     * @param alertHistory
     * @private
     */
    _alertHistoryChanged: function() {
        this.handleMapLegend();
    },
    
    /**
     * Determine if we should add, redraw, or remove our map legend
     * If the mode is `response` we will want to remove the legend, otherwise add/redraw
     * This also leverages alertHistory to determine if we have sufficient data to draw the legend
     */
    handleMapLegend: function() {
        if (this._alertHistory && this.mode !== 'response') {
            this._removeResponseAnswerLegend();
            
            if (this['_'+this._LOCATION_TYPE_COUNT_LEGEND_ID]) {
                this._redrawLocationTypesCountLegend();
            }
            else {
                this._addLocationTypesCountLegend();
            }
        }
        else {
            this._removeLocationTypesCountLegend();
            
            // Only draw the legend if we have content for it
            if (this._answers && this._answers.length > 0) {
                if (this['_'+this._RESPONSE_ANSWER_LEGEND_ID]) {
                    this._redrawResponseAnswerLegend();
                }
                else {
                    this._addResponseAnswerLegend();
                }
            }
            else {
                this._removeResponseAnswerLegend();
            }
        }
    },
    
    _getMarkerColorUrl: function(color) {
        if (!color) {
            color = 'orange';
        }
        return "https://maps.google.com/mapfiles/ms/icons/" + color + ".png";
    },

    /**
     *Monitors the `_notificationFilter` property and toggles the visibility of the location types legend (with state).
     * @param notificationFilter
     * @private
     */
    _notificationFilterChanged: function(notificationFilter) {
        if (notificationFilter) {
            if (this['_'+this._LOCATION_TYPE_STATE_LEGEND_ID]) {
                this._redrawLocationTypesStateLegend();
            }
            else {
                this._addLocationTypesStateLegend();
            }
        }
        else {
            this._removeLocationTypesStateLegend();
        }
    },

    /**
     * Monitors the `isPortrait` property. Landscape mode is no longer supported so this is not used.
     * If we do restore landscape mode then the changes made for VRAS-306 should be restored.
     * @private
     */
    _isPortraitChanged: function() {}
});
