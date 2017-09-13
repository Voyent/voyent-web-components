Polymer({
    is: 'voyent-my-locations',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    ready: function() {
        //Type options for drop-down menus.
        this._locationTypes = ['home','business','school','other'];
        this._creationTypes = ['pindrop','address'];
        this._creationType = 'pindrop';
        //An array of UserLocations.
        this._myLocations = [];
        //The location that is currently active in the editor (infoWindow is displayed).
        this._loadedLocation = null;
        //Since all changes are transient before they save we have these lists
        //to flag locations that require a db call once they hit save.
        this._locationsToUpdate = [];
        this._locationsToDelete = [];
        //Setup the infoWindow.
        this._setupInfoWindow();
        //Set the button state to disabled by default
        this._buttonsEnabled = false;
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
        //Fetch the realm region and the previously created locations.
        this._fetchRealmRegion();
        this._fetchMyLocations();
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
    },

    /**
     * Triggered whenever the user clicks the save button, fires the save and
     * delete calls based on changes made since component load or last save.
     * @private
     */
    _saveChanges: function() {
        if (!this._buttonsEnabled) { return; }
        var _this = this;
        //It's possible that the user edited a location and then later decided to
        //delete it so in these cases make sure we don't bother updating it.
        for (var i=this._locationsToUpdate.length-1; i>=0; i--) {
            if (this._locationsToDelete.indexOf(this._locationsToUpdate[i]) > -1) {
                this.splice('_locationsToUpdate',i,1);
            }
        }
        //Save and delete the locations. Once all operations are done display a message indicating the results.
        var promises = [];
        promises.push(this._saveLocations());
        promises.push(this._removeLocations());
        Promise.all(promises).then(function(results) {
            _this.fire('message-info',_this._getSavedMessage(results[0],results[1]));
            //Disable the buttons as long as we didn't have any POST failures.
            if (!results[0].failures) {
                _this._buttonsEnabled = false;
            }
        });
    },

    /**
     * Triggered whenever the user clicks the cancel button, reverts all changes made since component load or last save.
     * @private
     */
    _cancelChanges: function() {
        if (!this._buttonsEnabled) { return; }
        var _this = this;
        this._fetchMyLocations().then(function() {
            _this._buttonsEnabled = false;
            _this.fire('message-info','Successfully reverted all changes.');
        });
    },

    /**
     * Saves all locations that have been modified since component load or last save.
     * @returns {Promise}
     * @private
     */
    _saveLocations: function() {
        var _this = this, myLocation;
        return new Promise(function (resolve) {
            var promises = [];
            //Loop backwards since we're splicing.
            for (var i=_this._locationsToUpdate.length-1; i>=0; i--) {
                myLocation = _this._locationsToUpdate[i];
                //Make sure we have the latest JSON before saving it.
                myLocation.updateJSON();
                (function(myLocation) {
                    promises.push(new Promise(function (resolveRequest) {
                        voyent.locate.updateLocation({account:_this.account,realm:_this.realm,
                                                      location:myLocation.json}).then(function() {
                            //Don't use i to splice because it may change as we splice out other locations.
                            _this.splice('_locationsToUpdate',_this._locationsToUpdate.indexOf(myLocation),1);
                            resolveRequest(true);
                        }).catch(function () {
                            //Don't splice the _locationsToUpdate array on failure so the
                            //request will be attempted again the next time they save.
                            resolveRequest(false);
                        });
                    }));
                })(myLocation)
            }
            //Once all the update requests are complete return the results.
            //We will resolve immediately if the promises array is empty.
            Promise.all(promises).then(function(results) {
                resolve(_this._processResults(results));
            });
        });
    },

    /**
     * Removes all locations that have been deleted since component load or last save.
     * @returns {Promise}
     * @private
     */
    _removeLocations: function() {
        var _this = this, myLocation;
        return new Promise(function (resolve) {
            var promises = [];
            //Loop backwards since we're splicing.
            for (var i=_this._locationsToDelete.length-1; i>=0; i--) {
                myLocation = _this._locationsToDelete[i];
                (function(myLocation) {
                    promises.push(new Promise(function (resolveRequest) {
                        var query = {"location.properties.vras.id":myLocation.id};
                        voyent.locate.deleteLocations({account:_this.account,realm:_this.realm,
                                                       query:query}).then(function() {
                            //Don't use i to splice because it may change as we splice out other locations.
                            _this.splice('_locationsToDelete',_this._locationsToDelete.indexOf(myLocation),1);
                            resolveRequest(true);
                        }).catch(function () {
                            //It wasn't deleted so re-add it to the map.
                            myLocation.marker.setMap(_this._map);
                            _this._myLocations.push(myLocation);
                            _this.splice('_locationsToDelete',_this._locationsToDelete.indexOf(myLocation),1);
                            resolveRequest(false);
                        });
                    }));
                })(myLocation)
            }
            //Once all the update requests are complete return the results.
            //We will resolve immediately if the promises array is empty.
            Promise.all(promises).then(function(results) {
                resolve(_this._processResults(results));
            });
        });
    },

    /**
     * Whenever a property is edited we need to be sure to flag the associated location for updating.
     * @private
     */
    _flagLocationForUpdating: function() {
        if (this._locationsToUpdate.indexOf(this._loadedLocation) === -1) {
            this._locationsToUpdate.push(this._loadedLocation);
        }
        this._buttonsEnabled = true;
    },

    /**
     * Triggered whenever the user clicks the trash icon in the infoWindow.
     * Removes the location from the map and flags it for deletion.
     * @private
     */
    _flagLocationForRemoval: function() {
        this._infoWindow.close();
        this._infoWindowOpen = false;
        this._loadedLocation.removeFromMap();
        this._locationsToDelete.push(this._loadedLocation);
        this._myLocations.splice(this._myLocations.indexOf(this._loadedLocation));
        this._loadedLocation = null;
        this._buttonsEnabled = true;
    },

    /**
     * Returns the message to be displayed after the changes are saved.
     * @param saveResults
     * @param removalResults
     * @returns {string|*}
     * @private
     */
    _getSavedMessage: function(saveResults,removalResults) {
        var successMsg='', failureMsg='', locTxt;
        if (saveResults.successes || removalResults.successes) {
            if (saveResults.successes) {
                successMsg += 'Successfully updated ' + saveResults.successes;
            }
            if (removalResults.successes) {
                successMsg += (successMsg ? ' and removed ' : 'Successfully removed ') + removalResults.successes;
            }
            successMsg += saveResults.successes > 1 || removalResults.successes > 1 ? ' locations.' : ' location.';
        }
        if (saveResults.failures || removalResults.failures) {
            if (saveResults.failures) {
                failureMsg += 'Failed to update ' + saveResults.failures;
            }
            if (removalResults.failures) {
                failureMsg += (failureMsg ? ' and remove ' : 'Failed to remove ') + removalResults.failures + locTxt;
            }
            failureMsg += saveResults.failures > 1 || removalResults.failures > 1 ? ' locations.' : ' location.';
        }
        return successMsg + ' ' + failureMsg;
    },

    /**
     *
     * @param results
     * @private
     */
    _processResults: function(results) {
        var resultsObj = {"successes":0,"failures":0};
        for (var i=0; i<results.length; i++) {
            if (results[i]) { resultsObj.successes++; }
            else { resultsObj.failures++; }
        }
        return resultsObj;
    },

    /**
     * Initializes the infoWindow object and sets up associated listeners.
     * @private
     */
    _setupInfoWindow: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            //Initialize infoWindow object for later.
            _this._infoWindow = new google.maps.InfoWindow();
            //Close the infoWindow and re-display the previously hidden overlay when clicking on the map.
            google.maps.event.addListener(_this._map, "click", function() {
                _this._infoWindow.close();
                _this._infoWindowOpen = false;
                if (_this._loadedLocation) {
                    _this._loadedLocation.nameOverlay.displayAndDraw();
                }
            });
            //When clicking the close button on the infoWindow redisplay the overlay.
            google.maps.event.addListener(_this._infoWindow,'closeclick',function() {
                _this._infoWindowOpen = false;
                if (_this._loadedLocation) {
                    _this._loadedLocation.nameOverlay.displayAndDraw();
                }
            });
        });
    },

    /**
     * Displays an infoWindow that is triggered when clicking on the location markers.
     * @param myLocation
     * @private
     */
    _toggleInfoWindow: function(myLocation) {
        var _this = this;
        //If the selected infoWindow is already opened then close it.
        if (this._infoWindowOpen && myLocation === this._loadedLocation) {
            this._infoWindow.close();
            _this._loadedLocation.nameOverlay.displayAndDraw();
            this._infoWindowOpen = false;
        }
        else {
            setTimeout(function() {
                //Re-display any previously hidden location overlay.
                if (_this._loadedLocation) {
                    _this._loadedLocation.nameOverlay.displayAndDraw();
                }
                _this._loadedLocation = myLocation;
                _this.$.infoWindow.removeAttribute('hidden');
                _this._infoWindow.open(_this._map,_this._loadedLocation.marker);
                _this._infoWindowOpen = true;
                _this._infoWindow.setContent(_this.$.infoWindow);
                //Hide the current location's overlay.
                _this._loadedLocation.nameOverlay.hide();
            },0);
        }
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
            !this._locationName || !this._locationName.trim() || !this._locationType) {
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
        if (this._creationType === 'address') {
            this._buttonsEnabled = true;
        }
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
        google.maps.event.addListener(this._drawingManager, 'markercomplete', function (marker) {
            //Draw the location marker and exit drawing mode.
            _this._createLocation(marker);
            _this._drawingManager.setDrawingMode(null);
            _this._buttonsEnabled = true;
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
        //Build the new location.
        var newLocation = new this._MyLocation(null,this._locationName,this._locationType,marker,null);
        this._myLocations.push(newLocation);
        this._locationsToUpdate.push(newLocation);
        //Reset the dialog properties.
        this._locationType = this._locationName = null;
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
            placesBusiness=["accounting","airport","amusement_park","aquarium","art_gallery","atm",
                            "bakery","bank","bar","beauty_salon","bicycle_store","book_store",
                            "bowling_alley","cafe","campground","car_dealer","car_rental",
                            "car_repair","car_wash","casino","clothing_store","convenience_store",
                            "dentist","department_store","electrician","electronics_store","florist",
                            "furniture_store","gas_station","gym","hair_care","hardware_store",
                            "home_goods_store","insurance_agency","jewelry_store","laundry","lawyer",
                            "liquor_store","locksmith","lodging","meal_delivery","meal_takeaway",
                            "movie_rental","movie_theater","moving_company","night_club","painter",
                            "parking","pet_store","pharmacy","physiotherapist","plumber","post_office",
                            "real_estate_agency","restaurant","roofing_contractor","rv_park","shoe_store",
                            "shopping_mall","spa","stadium","storage","store","taxi_stand","travel_agency",
                            "veterinary_care","zoo"],
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
                                                                {"bounds":this._areaRegion.bounds,"strictBounds":false});
        google.maps.event.addListener(this._autoComplete, 'place_changed', function() {
            place = _this._autoComplete.getPlace();
            if (place && place.geometry && place.geometry.location) {
                _this._placeCoordinates = place.geometry.location;
                _this._locationName = place.name;
                _this._locationType = _this._determineLocationType(place.types);
            }
            else if (!place || Object.keys(place).length === 1) {
                _this._placeCoordinates = null;
                _this._locationName = null;
            }
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
    },

    /**
     *
     * @param position
     * @param enabled
     * @returns {string}
     * @private
     */
    _getButtonClass: function(position,enabled) {
        return 'control-button ' + position + ' ' + (enabled ? 'enabled' : 'disabled');
    }
});