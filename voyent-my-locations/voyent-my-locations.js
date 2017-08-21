Polymer({
    is: 'voyent-my-locations',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    ready: function() {
        //Type options for drop-down menus.
        this._locationTypes = ['home','business','school','other'];
        this._creationTypes = ['pindrop','address'];
        this._creationType = 'pindrop';
        //A uid mapped container of all locations.
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
        //Add the buttons to the map.
        this._addCustomControl();
        //Only enable the marker when we are logged in.
        this._drawingManager.setOptions({
            "drawingControlOptions":{
                "drawingModes":[],
                "position":google.maps.ControlPosition.TOP_RIGHT}
        });
        //Initialize infoWindow object for later.
        this._infoWindow = new google.maps.InfoWindow();
        //Fetch the realm region and the previously created locations.
        this._fetchRealmRegion();
        this._fetchLocations();
        //Add "create new location" button.
        this._addMarkerButton(function() {
            _this._openDialog(function () {
                if (_this._creationType === 'pindrop') {
                    _this._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
                }
                else {
                    _this._createLocation(new google.maps.Marker({
                        position: _this._placeCoordinates,
                        map: _this._map,
                        draggable: true
                    }));
                }
            });
        });
        //Close the infoWindow when clicking on the map.
        google.maps.event.addListener(this._map, "click", function() {
            _this._infoWindow.close();
        });
    },

    /**
     * Fetches existing fixed location records.
     * @private
     */
    _fetchLocations: function() {
        var _this = this;
        this._fetchMyLocations().then(function(locations) {
            //Clear the map of any previously drawn entities and draw the new locations.
            _this._clearMap();
            _this._drawLocations(locations);
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
            this._locations[locations[i].location.properties.vras.uid] = {"location":locations[i], "marker":marker};
            this._setupLocationListeners(this._locations[locations[i].location.properties.vras.uid]);
        }
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
                this.splice('_locationsToUpdate',i,1);
            }
        }
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
        var _this = this, locationData;
        //Loop backwards since we're splicing.
        for (var i=this._locationsToUpdate.length-1; i>=0; i--) {
            locationData = this._locationsToUpdate[i];
            (function(locationData) {
                voyent.locate.updateLocation({account:_this.account,realm:_this.realm,
                                              location:locationData.location}).then(function() {
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
                var query = {"location.properties.vras.uid":locationData.location.location.properties.vras.uid};
                voyent.locate.deleteLocations({account:_this.account,realm:_this.realm,
                                               query:query}).then(function() {
                //Don't use i to splice because it may change as we splice out other locations.
                _this.splice('_locationsToDelete',_this._locationsToDelete.indexOf(locationData),1);
                }).catch(function (error) {
                    _this.fire('message-error', 'Issue deleting location: ' +
                               locationData.location.location.properties.vras.label +
                               ' (' + locationData.location.location.properties.vras.type + ')' +
                               ' : ' + (error.responseText || error.message || error));
                    //It wasn't deleted so re-add it to the map.
                    locationData.marker.setMap(_this._map);
                    _this._locations[locationData.location.location.properties.vras.uid] = locationData;
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
        delete this._locations[this._loadedLocationData.location.location.properties.vras.uid];
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
     * Adds the map control that contains the save and cancel buttons.
     * @private
     */
    _addCustomControl: function() {
        if (this._customControlAdded) { return; }
        this.$.customControl.removeAttribute('hidden');
        this._map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(this.$.customControl);
        this._customControlAdded = true;
    },

    //The dialog functions below override the functions in the behaviour.

    /**
     * Opens the dialog for creating a new location.
     * @param confirmFunc
     * @param cancelFunc
     * @private
     */
    _openDialog: function(confirmFunc,cancelFunc) {
        this._dialogConfirmFunc = confirmFunc;
        this._dialogCancelFunc = cancelFunc;
        var dialog = this.querySelector('#modalDialog');
        if (dialog) { dialog.open(); }
    },

    /**
     * Handles dialog input validation and calling the confirmation function if available.
     * @private
     */
    _confirmDialog: function() {
        //Validate the dialog.
        if (!this._creationType || (this._creationType === 'address' && !this._placeCoordinates) ||
            !this._locationLabel || !this._locationLabel.trim() || !this._locationType) {
            this.fire('message-error', 'Please complete all fields.');
            return;
        }
        //We allow for passing the confirm function directly or as a string.
        if (this._dialogConfirmFunc) {
            if (typeof this._dialogConfirmFunc === 'string') { this[this._dialogConfirmFunc](); }
            else { this._dialogConfirmFunc(); }
        }
        //Close the dialog after.
        this._closeDialog(true);
    },

    /**
     * Handles closing the dialog and calling the cancel function if available.
     * @param confirmed
     * @private
     */
    _closeDialog: function(confirmed) {
        //Only call the cancel function if this is triggered by a cancel.
        //We allow passing the confirm function directly or as a string.
        if (!confirmed && this._dialogCancelFunc) {
            if (typeof this._dialogCancelFunc === 'string') { this[this._dialogCancelFunc](); }
            else { this._dialogCancelFunc(); }
        }
        this._dialogConfirmFunc = this._dialogCancelFunc = null;
        this.querySelector('#modalDialog').close();
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
            //Display the marker.
            oce.overlay.setMap(_this._map);
            //Draw the location marker
            _this._createLocation(oce.overlay);
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
     * Builds a location record from the passed marker.
     * @param marker
     * @private
     */
    _createLocation: function(marker) {
        //Build the location record, add the required listeners and flag it for updating.
        var latLng = marker.getPosition();
        var locationData = {"location":{
            "location": {
                "geometry": { "type" : "Point", "coordinates" : [latLng.lng(),latLng.lat()] },
                "properties": {
                    "vras": {
                        "label":this._locationLabel,
                        "type":this._locationType,
                        //Generate a number using the timestamp and a random number in the hundred thousands.
                        "uid":new Date().getTime()+'-'+Math.floor(Math.random()*(900000)+100000)
                    }
                }
            }
        },"marker":marker};
        this._locations[locationData.location.location.properties.vras.uid] = locationData;
        this._locationsToUpdate.push(locationData);
        this._setupLocationListeners(locationData);
        //Display the infoWindow for the new location.
        this._displayInfoWindow(locationData);
        //Reset the dialog properties.
        this._locationType = this._locationLabel = null;
        var autocomplete = this.$$('#autoComplete');
        if (autocomplete) {
            autocomplete.value = '';
        }
    },

    /**
     * Try and determine the location type based on the place types that Google provides.
     * @param types
     * @returns {*}
     * @private
     */
    _determineLocationType: function(types) {
        //Places type categories provided by Google.
        var placesHome=["street_address","postal_code"],
            placesBusiness=["accounting","airport","amusement_park","aquarium","art_gallery","atm","bakery","bank","bar","beauty_salon","bicycle_store","book_store","bowling_alley","cafe","campground","car_dealer","car_rental","car_repair","car_wash","casino","clothing_store","convenience_store","dentist","department_store","electrician","electronics_store","florist","furniture_store","gas_station","gym","hair_care","hardware_store","home_goods_store","insurance_agency","jewelry_store","laundry","lawyer","liquor_store","locksmith","lodging","meal_delivery","meal_takeaway","movie_rental","movie_theater","moving_company","night_club","painter","parking","pet_store","pharmacy","physiotherapist","plumber","post_office","real_estate_agency","restaurant","roofing_contractor","rv_park","shoe_store","shopping_mall","spa","stadium","storage","store","taxi_stand","travel_agency","veterinary_care","zoo"],
            placesSchool=["school","university"];

        var hc = bc = sc = 0;
        for (var i=0; i<types.length; i++) {
            placesHome.indexOf(types[i]) > -1 ? hc++ : hc;
            placesBusiness.indexOf(types[i]) > -1 ? bc++ : bc;
            placesSchool.indexOf(types[i]) > -1 ? sc++ : sc;
        }
        if (hc > bc && hc > sc) { return 'home'; }
        else if (bc > hc && bc > sc) { return 'business'; }
        else if (sc > hc && sc > bc) { return 'school'; }
        return 'other';
    },

    /**
     * Initialize the places autoComplete.
     * @private
     */
    _setupAutoComplete: function() {
        if (this._autoComplete) { return; }
        var _this = this, place;
        this._autoComplete = new google.maps.places.Autocomplete(this.$$('#autoComplete').querySelector('input'),
                                                                {"bounds":this._areaRegion.bounds,"strictBounds":true});
        google.maps.event.addListener(this._autoComplete, 'place_changed', function() {
            place = _this._autoComplete.getPlace();
            if (place && place.geometry && place.geometry.location) {
                _this._placeCoordinates = place.geometry.location;
                _this._locationLabel = place.name;
                _this._locationType = _this._determineLocationType(place.types);
            }
            else if (!place || Object.keys(place).length === 1) {
                _this._placeCoordinates = null;
                _this._locationLabel = null;
            }
        });
    },

    /**
     * Initialize google map listeners for moving and clicking on the locations.
     * @param locationData
     * @private
     */
    _setupLocationListeners: function(locationData) {
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
     * Returns whether the passed creationType is of the address type.
     * @param creationType
     * @private
     */
    _isAddress: function(creationType) {
        var _this = this;
        var isAddress = creationType === 'address';
        //Make sure we initialize the autoComplete, async is required to allow it time to render.
        if (isAddress) {
            setTimeout(function() {
                _this._setupAutoComplete();
            },0);
        }
        return isAddress;
    },

    /**
     * Proper-case the passed type.
     * @param type
     * @returns {string}
     * @private
     */
    _returnLocTypeLabel: function(type) {
        return type ? (type.charAt(0).toUpperCase() + type.slice(1)) : type;
    },

    /**
     * Proper-case the passed type.
     * @param type
     * @returns {string}
     * @private
     */
    _returnCreateTypeLabel: function(type) {
        return type === 'pindrop' ? 'Pin Drop' : 'Address';
    }
});