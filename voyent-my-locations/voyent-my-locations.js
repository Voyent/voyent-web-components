Polymer({
    is: 'voyent-my-locations',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour, Voyent.TooltipBehaviour],

    properties: {
        /**
         * Indicates whether the component is loaded on mobile.
         */
        isMobile: { type: Boolean, value: false },
        /**
         * Indicates whether the component is in portrait mode. Applicable only when isMobile is true.
         */
        isPortrait: { type: Boolean, value: false, observer: '_isPortraitChanged' }

    },

    attached: function() {
        this.querySelector('#nameValidatorInfoWindow').validate = this._validateInfoWindowLocationName.bind(this);
        this.querySelector('#nameValidatorPlace').validate = this._validatePlaceLocationName.bind(this);
        this.querySelector('#nameValidatorPinDrop').validate = this._validatePinDropLocationName.bind(this);
        this.querySelector('#nameValidatorDialog').validate = this._validateDialogLocationName.bind(this);
        this.querySelector('#placesSearchValidator').validate = this._validatePlacesSearch.bind(this);
    },

    ready: function() {
        var _this = this;
        //Flag used to prevent map panning while the component is initializing since it will be panned once afterwards.
        this._initializingMyLocations = true;
        //An array of MyLocations, represents the saved locations currently on the map.
        this.set('_myLocations',[]);
        //The location that is currently active in the editor (infoWindow is displayed).
        this._loadedLocation = null;
        //An object containing details of the last Google Place search result (after clicking a place icon on map).
        this._selectedPlace = null;
        //An object containing details of the a newly created pin drop location.
        this._pinDropLocation = null;
        //A flag for counting the keypresses to the autocomplete entry so we can reset state as necessary.
        this._autocompleteKeyupCount = 0;
        //Padding to apply to the tooltip, represents the VRAS app header height.
        this._tooltipPadding = 64;
        //Set the values of the map tooltip positioning as it changes for the various view options and set our displayed toggle.
        this._mapTooltipDesktopPos = 'centered-top';
        this._mapTooltipPortraitPos = 'centered-bottom';
        this._mapTooltipLandscapePos = 'left-top';
        this._tooltipsDisplayed = true;
        //Initialize other pieces that depend on the map.
        this._mapIsReady().then(function() {
            //Setup the infoWindow.
            _this._setupInfoWindow();
            //Initialize places service for later.
            _this._placesService = new google.maps.places.PlacesService(_this._map);
            //Specify that we want to skip panning to the region boundary
            //as we'll conditionally pan in the promises callback.
            _this._skipRegionPanning = true;
            //Fetch the realm region and the previously created locations. After we have them
            //both adjust the bounds based on whether we retrieved any location records.
            var promises = [];
            promises.push(_this._fetchRealmRegion());
            promises.push(_this._fetchMyLocations());
            Promise.all(promises).then(function() {
                _this._initializingMyLocations = false;
                _this._adjustBoundsAndPan();
            });
        });
    },

    observers: [
        '_myLocationsUpdated(_myLocations.length)',
        '_infoWindowNameChanged(_infoWindowLocationName)',
        '_selectedPlaceNameChanged(_selectedPlace.name)',
        '_pinDropNameChanged(_pinDropLocation.name)',
        '_dialogNameChanged(_dialogLocationName)'
    ],

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function () {
        this._addCustomControls();
    },

    /**
     * Saves all locations that have been modified since component load or last save.
     * @param locationToSave
     * @param msgSuffix
     * @private
     */
    _saveLocation: function(locationToSave,msgSuffix) {
        var _this = this;
        //Ensure we have the latest JSON before saving it.
        locationToSave.updateJSON();

        voyent.locate.updateLocation({account:this.account,realm:this.realm,location:locationToSave.json}).then(function() {
            locationToSave.isPersisted = true;
            if (_this._myLocations.indexOf(locationToSave) === -1) {
                _this.push('_myLocations',locationToSave);
            }
            //_this.fire('message-info','Location ' + msgSuffix);
        }).catch(function () {
            _this.fire('message-error','Location update failed');
        });
    },

    /**
     * Removes the currently loaded location.
     * @private
     */
    _removeLocation: function() {
        var _this = this;
        if (this._myLocations.length === 1) {
            this.fire('message-error','You must have at least one location');
            return;
        }
        this._closeInfoWindow(true);
        this._loadedLocation.removeFromMap();
        var query = {"location.properties.vras.id":this._loadedLocation.id};
        voyent.locate.deleteLocations({account:this.account,realm:this.realm,query:query}).then(function() {
            var indexToRemove = _this._myLocations.indexOf(_this._loadedLocation);
            if (indexToRemove > -1) {
                _this.splice('_myLocations',indexToRemove,1);
            }
            //_this.fire('message-info','Location removed');
        }).catch(function () {
            _this._loadedLocation.addToMap();
            _this.fire('message-error','Location removal failed');
        });
    },

    /**
     * Opens the dialog for creating a new address location.
     * @private
     */
    _addAddressBasedLocation: function() {
        var _this = this;
        //Always start with a fresh dialog.
        this._resetDialogProperties();
        //Open the dialog and initialize the autocomplete.
        this._openDialog(function () {
            _this._closeInfoWindow();
            setTimeout(function() {
                _this._createLocation(
                    _this._dialogLocationName,
                    _this._isPrivateResidence,
                    new google.maps.Marker({
                        position: _this._placeCoordinates,
                        map: _this._map,
                        draggable: true,
                        icon: _this._MY_LOCATION_ICON_INACTIVE
                    }),'created');
                _this._resetDialogProperties();
            },0);
        });
        //Initialize and focus on the autocomplete.
        _this._setupAutoComplete();
        if (!_this.isMobile) {
            setTimeout(function() {
                _this.querySelector('#autoComplete').focus();
            },250);
        }
    },

    /**
     * Handles saving a location after its info window properties have changed.
     * @private
     */
    _savePendingOrNewLocation: function() {
        var doUpdate = false;
        if (this._loadedLocation) {
            if (this._locationNameValid && this._loadedLocation.name !== this._infoWindowLocationName) {
                this._loadedLocation.setName(this._infoWindowLocationName);
                doUpdate = true;
            }
            var newType = this._getTypeFromPrivateResidence(this._inputPrivateResidence);
            if (this._loadedLocation.type !== newType) {
                this._loadedLocation.setType(newType);
                doUpdate = true;
            }
            if (doUpdate) {
                this._saveLocation(this._loadedLocation,this._loadedLocation.isPersisted ? 'updated' : 'created');
            }
        }
    },

    /**
     * Initializes the infoWindow object and sets up associated listeners.
     * @private
     */
    _setupInfoWindow: function() {
        var _this = this;
        //Initialize infoWindow object for later.
        _this._infoWindow = new google.maps.InfoWindow();
        google.maps.event.addListener(_this._map, 'click', function(e) {
            //If the info window is open we will close it and if the user did not
            //click on a place we will also pan the map to show all the locations.
            if (_this._infoWindowOpen) {
                _this._closeInfoWindow();
                if (!e.placeId) {
                    _this._adjustBoundsAndPan();
                }
            }
            //If we have a placeId then it means a location of interest was clicked on the map. In this case we will
            //replace the default infoWindow with a custom one so the user can optionally add it to their locations.
            if (e.placeId) {
                //Prevent the default info window from opening.
                e.stop();
                _this._placesService.getDetails({placeId: e.placeId}, function(place,status) {
                    if (status === 'OK') {
                        _this._selectedPlace = _this._buildPlaceDetails(place);
                    }
                    else {
                        _this._selectedPlace = {
                            "name":'Unknown Location',
                            "latLng":e.latLng,
                            "type": 'place'
                        };
                    }
                    //Open the info window.
                    _this._toggleInfoWindow(_this._selectedPlace);
                });
            }
        });
        //When clicking the close button on the infoWindow redisplay the overlay.
        google.maps.event.addListener(_this._infoWindow,'closeclick',function() {
            _this._closeInfoWindow();
            _this._adjustBoundsAndPan();
        });
    },

    /**
     * Displays an infoWindow that is triggered when clicking on location markers or clicking on a place icon.
     * @param selectedLocation
     * @param skipSave
     * @private
     */
    _toggleInfoWindow: function(selectedLocation,skipSave) {
        var _this = this;
        //If the info window is already open then we will close it.
        if (this._infoWindowOpen) {
            //Always skip pan if we are opening another info window and one is already open.
            this._closeInfoWindow(!!skipSave);
            //If no location was selected or the location that was selected is
            //already selected then just close the info window and pan the map.
            if (!selectedLocation || (selectedLocation && selectedLocation === this._loadedLocation)) {
                this._adjustBoundsAndPan();
                return;
            }
        }
        //Do this async so we don't get rendering flicker when opening the info window.
        setTimeout(function() {
            if (selectedLocation instanceof _this._MyLocation) {
                //Reset state so the correct infoWindow is shown
                _this._pinDropLocation = null;
                _this._selectedPlace = null;
                //Load the location details and open the infoWindow
                _this._loadedLocation = selectedLocation;
                _this._infoWindowLocationName = _this._loadedLocation.name;
                _this._locationNameValid = true;
                _this._inputPrivateResidence = _this._loadedLocation.type === 'residential';
                _this._infoWindow.open(_this._map,_this._loadedLocation.marker);
                //Hide the current location's overlay.
                _this._loadedLocation.nameOverlay.hide();
                selectedLocation.marker.setIcon(_this._MY_LOCATION_ICON_ACTIVE);
                //Pan to the location and ensure input validation state is correct
                setTimeout(function() {
                    _this._panToLatLng(selectedLocation.marker.getPosition());
                    _this.querySelector('#infoWindowLocationName').invalid = false;
                    if (!_this.isMobile) {
                        _this.querySelector('#infoWindowLocationName').focus();
                    }
                },0);
            }
            else if (selectedLocation.type === 'place') {
                //Reset template state so the correct infoWindow is shown
                _this._pinDropLocation = null;
                _this._loadedLocation = null;
                //Set the infoWindow position and open it
                _this._infoWindow.setPosition(selectedLocation.latLng);
                _this._infoWindow.open(_this._map);
                //Pan to the location and ensure input validation state is correct
                setTimeout(function() {
                    _this._panToLatLng(selectedLocation.latLng);
                    _this.querySelector('#placeLocationName').invalid = false;
                    if (!_this.isMobile) {
                        _this.querySelector('#placeLocationName').focus();
                    }
                },0);
            }
            else if (selectedLocation.type === 'pindrop') {
                //Reset state so the correct infoWindow is shown
                _this._selectedPlace = null;
                _this._loadedLocation = null;
                //Set the infoWindow position and open it
                _this._infoWindow.setPosition(selectedLocation.latLng);
                _this._infoWindow.open(_this._map);
                //Pan to the location and ensure input validation state is correct
                setTimeout(function() {
                    _this._panToLatLng(selectedLocation.latLng);
                    _this.querySelector('#pinDropLocationName').invalid = false;
                    if (!_this.isMobile) {
                        _this.querySelector('#pinDropLocationName').focus();
                    }
                },0);
            }
            _this.$.infoWindow.removeAttribute('hidden');
            _this._infoWindow.setContent(_this.$.infoWindow);
            _this._infoWindowOpen = true;
        },0);
    },

    /**
     * Closes the info window.
     * @param skipSave
     * @private
     */
    _closeInfoWindow: function(skipSave) {
        this._infoWindow.close();
        this._infoWindowOpen = false;
        if (this._loadedLocation) {
            this._loadedLocation.nameOverlay.displayAndDraw();
            this._loadedLocation.marker.setIcon(this._MY_LOCATION_ICON_INACTIVE);
            if (!skipSave) {
                this._savePendingOrNewLocation();
            }
        }
    },

    /**
     * Handles submitting or closing the existing location dialog on enter and escape key presses.
     * @param e
     * @private
     */
    _handleInfoWindowKeyPress: function(e) {
        if (e.key === 'Enter') {
            this._closeInfoWindow();
            this._adjustBoundsAndPan();
        }
        else if (e.key === 'Escape') {
            this._closeInfoWindow(true);
            this._adjustBoundsAndPan();
        }
    },

    /**
     * Handles submitting or closing the new place dialog on enter and escape key presses.
     * @param e
     * @private
     */
    _handleNewPlaceKeyPress: function(e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            this._addPlaceToMyLocations();
        }
        else if (e.key === 'Escape') {
            this._closeInfoWindow(true);
            this._adjustBoundsAndPan();
        }
    },

    /**
     * Handles submitting or closing the new pin drop dialog on enter and escape key presses.
     * @param e
     * @private
     */
    _handleNewPinDropKeyPress: function(e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            this._addPinDropToMyLocations();
        }
        else if (e.key === 'Escape') {
            this._closeInfoWindow(true);
            this._adjustBoundsAndPan();
        }
    },

    /**
     * Builds the relevant place details from the Google Places search result.
     * @param place
     * @private
     */
    _buildPlaceDetails: function(place) {
        var selectedPlace = {
            "name":place.name,
            "latLng":place.geometry.location,
            "type": 'place'
        };
        var addressComponent;
        for (var i=0; i<place.address_components.length; i++) {
            addressComponent = place.address_components[i];
            if (addressComponent.types.indexOf('street_number') > -1) {
                selectedPlace.streetNumber = addressComponent.short_name || addressComponent.long_name;
            }
            else if (addressComponent.types.indexOf('route') > -1) {
                selectedPlace.route = addressComponent.short_name || addressComponent.long_name;
            }
            else if (addressComponent.types.indexOf('locality') > -1) {
                selectedPlace.locality = addressComponent.short_name || addressComponent.long_name;
            }
            else if (addressComponent.types.indexOf('political') > -1 &&
                addressComponent.types.indexOf('country') === -1) {
                selectedPlace.political = addressComponent.short_name || addressComponent.long_name;
            }
            else if (addressComponent.types.indexOf('postal_code') > -1) {
                selectedPlace.postalCode = addressComponent.short_name || addressComponent.long_name;
            }
        }
        return selectedPlace;
    },

    /**
     * Adds the map control that contains the save and cancel buttons.
     * @private
     */
    _addCustomControls: function() {
        var _this = this;
        if (this._customControlsAdded) { return; }
        _this._map.controls[google.maps.ControlPosition.RIGHT_TOP].push(_this.$.customControls);
        _this._customControlsAdded = true;
        //Since Google Maps version 3.32 we must explicitly wait for the map controls to be visible before rendering the tooltips.
        //Unfortunately, we don't have a better way to check that the controls are visible other than searching for one of them.
        function waitForControls() {
            if (!document.querySelector('#map #customControls')) {
                setTimeout(waitForControls,100);
                return;
            }
            //Remove the hidden attribute, do this after the controls are rendered so they don't flicker on the page before being positioned.
            var elem = document.querySelector('#customControls');
            if (elem) {
                elem.removeAttribute('hidden');
            }
            //Setup our tooltips after we've added our custom control.
            _this._setupTooltips([{
                    tooltipSelector:'#addLocationTooltip',
                    targetSelector:'#customControls paper-button',
                    position:"below",
                    topPadding:(_this.isMobile ? _this._tooltipPadding : 0) - 25
                },
                {
                    tooltipSelector:'#mapTooltip',
                    targetSelector:'#map',
                    position:!_this.isMobile ? _this._mapTooltipDesktopPos : (_this.isPortrait ? _this._mapTooltipPortraitPos : _this._mapTooltipLandscapePos),
                    topPadding:!_this.isMobile ? -_this._tooltipPadding : (_this.isPortrait ? _this._tooltipPadding : 0)
                }
            ]);
            //Close the tooltips when the user begins to interact with the page. Remove the listener
            //after they click once. We use removeEventListener rather than the {once:true} option
            //because this is not supported in IE11 and causes issues with page interaction.
            var windowClickListener = function() {
                _this._hideTooltips();
                _this._tooltipsDisplayed = false;
                window.removeEventListener('click',windowClickListener);
            };
            window.addEventListener('click',windowClickListener);
        }
        waitForControls();
    },

    /**
     * Toggles tooltip help bubbles.
     * @private
     */
    _toggleBubbleHelp: function() {
        this._toggleTooltips();
        this._repositionTooltips();
        this._tooltipsDisplayed = !this._tooltipsDisplayed;
    },

    /**
     * Monitors the `isPortrait` property and adjusts tooltip position as necessary.
     * @private
     */
    _isPortraitChanged: function(isPortrait) {
        if (!this.isMobile) { return; }
        var _this = this;
        //Adjust tooltip position on orientation changes. Add a slight delay to allow the device to switch orientations.
        setTimeout(function() {
            if (_this._tooltipsList && _this._tooltipsList[1]) {
                _this._tooltipsList[1].position = isPortrait ? _this._mapTooltipPortraitPos : _this._mapTooltipLandscapePos;
                _this._tooltipsList[1].topPadding = isPortrait ? _this._tooltipPadding : 0;
                _this._repositionTooltips();
            }
            //Ensure the dialog resizes correctly if it is open during the orientation change.
            var dialog = _this.querySelector('#modalDialog');
            if (dialog) {
                dialog.notifyResize();
            }
            //Ensure the map resizes correctly after orientation changes.
            setTimeout(function() {
                _this._resizeMapAndAdjustBounds();
            },500);
        },400);
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
        if (dialog) {
            dialog.open();
        }
    },

    /**
     * Handles dialog input validation and calling the confirmation function if available.
     * @private
     */
    _confirmDialog: function() {
        if (!this._validateDialog()) { return; }
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
     * Validates each field in the dialog.
     * @returns {boolean}
     * @private
     */
    _validateDialog: function() {
        var haveErrors = false;
        if (!this.querySelector('#autoComplete').validate()) {
            haveErrors = true;
        }
        if (!this.querySelector('#dialogLocationName').validate()) {
            haveErrors = true;
        }
        return !haveErrors;
    },

    /**
     * Initialize the listeners required to pin drop a location by holding the mouse down on the map.
     * @private
     */
    _setupMapListeners: function () {
        var _this = this;
        google.maps.event.addListener(this._map, 'mousedown', function(e) {
            //Ensure we only setup one interval. Mousedown will fire twice on mobile for pinch events.
            if (_this._mouseHoldTimer) { return; }
            //If the user holds the mouse down for a set interval then create a new location at that position.
            _this._mouseHoldTimer = setTimeout(function() {
                //We will just display an overlay indicating to the user that they should release their mouse. We do this
                //rather than rendering the infoWindow immediately to avoid issues with releasing panning mode (VRAS-293).
                _this._mouseHoldOverlay = new _this._MouseHoldOverlay(e.latLng,e.pixel);
            },500);
        });
        google.maps.event.addListener(this._map, 'mouseup', function(e) {
            if (_this._mouseHoldOverlay) {
                //Remove the temporary overlay from the view.
                _this._mouseHoldOverlay.setMap(null);
                _this._mouseHoldOverlay = null;
                //Reset some values and create a container for our pin drop location data.
                _this._pinDropLocation = {
                    "name": '',
                    "isPrivateResidence": false,
                    "latLng": e.latLng,
                    "type": "pindrop"
                };
                //Open the info window.
                _this._toggleInfoWindow(_this._pinDropLocation);
            }
            clearTimeout(_this._mouseHoldTimer);
            _this._mouseHoldTimer = null;
        });
        google.maps.event.addListener(this._map, 'drag', function() {
            clearTimeout(_this._mouseHoldTimer);
            _this._mouseHoldTimer = null;
        });
        //Add a keyup listener so that if the user presses escape while creating a pin drop location the op will be cancelled.
        window.addEventListener('keyup', function(e) {
            if (_this._mouseHoldOverlay && e.key === 'Escape') {
                _this._mouseHoldOverlay.setMap(null);
                _this._mouseHoldOverlay = null;
            }
        });
    },

    /**
     * Adds a new location that was created via pin drop.
     * @private
     */
    _addPinDropToMyLocations: function() {
        if (!this._pinDropLocation) { return; }
        if (!this.querySelector('#pinDropLocationName').validate()) { return; }
        this._loadedLocation = this._createLocation(
            this._pinDropLocation.name,
            this._pinDropLocation.isPrivateResidence,
            new google.maps.Marker({
                map: this._map,
                position: this._pinDropLocation.latLng,
                draggable: true,
                icon: this._MY_LOCATION_ICON_INACTIVE
        }),'created');
        this._pinDropLocation = null;
        this._toggleInfoWindow(null,true);
    },

    /**
     * Adds the last selected Google Place to the map as a new location.
     * @private
     */
    _addPlaceToMyLocations: function() {
        if (!this._selectedPlace) { return; }
        if (!this.querySelector('#placeLocationName').validate()) { return; }
        this._loadedLocation = this._createLocation(
            this._selectedPlace.name,
            false,
            new google.maps.Marker({
                map: this._map,
                position: this._selectedPlace.latLng,
                draggable: true,
                icon: this._MY_LOCATION_ICON_INACTIVE
        }),'created');
        this._selectedPlace = null;
        this._toggleInfoWindow(null,true);
    },

    /**
     * Builds a location record from the passed marker and returns it.
     * @param name
     * @param isPrivateResidence
     * @param marker
     * @param msgSuffix
     * @returns {Voyent.AlertBehaviour._MyLocation}
     * @private
     */
    _createLocation: function(name,isPrivateResidence,marker,msgSuffix) {
        var newLocation = new this._MyLocation(null, name, this._getTypeFromPrivateResidence(isPrivateResidence), marker);
        this._saveLocation(newLocation,msgSuffix);
        return newLocation;
    },

    /**
     * Resets input fields used in the dialog.
     * @private
     */
    _resetDialogProperties: function() {
        this._autocompleteValue = null;
        this._dialogLocationName = null;
        this._isPrivateResidence = false;
        if (this.querySelector('#autoComplete')) {
            this.querySelector('#dialogLocationName').invalid = false;
        }
        if (this.querySelector('#dialogLocationName')) {
            this.querySelector('#dialogLocationName').invalid = false;
        }
    },

    /**
     * Initialize the places autoComplete.
     * @private
     */
    _setupAutoComplete: function() {
        if (this._autoComplete) { return; }
        var _this = this, place;
        var autocompleteInput = this.$$('#autoComplete').querySelector('input');
        //Wait until we have the area region so we can favour results from within that region.
        this._areaRegionIsAvailable().then(function() {
            _this._autoComplete = new google.maps.places.Autocomplete(autocompleteInput, {
                "bounds":_this._areaRegion.bounds, "strictBounds":false, "componentRestrictions": {"country":"CA"}
            });
            google.maps.event.addListener(_this._autoComplete, 'place_changed', function() {
                place = _this._autoComplete.getPlace();
                if (place && place.geometry && place.geometry.location) {
                    _this._placeCoordinates = place.geometry.location;
                }
                else if (!place || Object.keys(place).length === 1) {
                    _this._placeCoordinates = null;
                }
                _this.querySelector('#autoComplete').validate();
            });
        });
    },

    /**
     * Listens for changes to the autocomplete input so we can clear the
     * place selection if the user manually clears the autocomplete.
     * @private
     */
    _autoCompleteChanged: function() {
        if (!this._autocompleteValue) {
            this._placeCoordinates = null;
        }
    },

    /**
     * Handles trapping specific keypresses on the autocomplete when the list is open so they don't bubble to the dialog.
     * @param e
     * @private
     */
    _handleAutocompleteKeyPress: function(e) {
        //Reset our keypress state on every 2 keypresses because we only need to track the last two
        //keypreses - one for selecting a list entry and one for the enter or escape keys after.
        if (this._autocompleteKeyupCount === 2) {
            this._autocompleteKeyupCount = 0;
            this._autocompleteListItemSelected = false;
        }
        if (document.querySelector('.pac-item-selected')) {
            this._autocompleteEntryWasSelected = true;
        }
        //When an autocomplete list entry was selected on the last keypress then
        //we want to prevent the event from bubbling on any enter or escape key
        //presses after so we don't submit the dialog listener.
        if (this._autocompleteEntryWasSelected && (e.key === 'Enter' || e.key === 'Escape')) {
            this._autocompleteEntryWasSelected = false;
            e.stopPropagation();
        }
        this._autocompleteKeyupCount++;
    },

    /**
     * Updates the map bounds so all the locations and location name overlays are in view and then pans the map.
     * @private
     */
    _adjustBoundsAndPan: function() {
        var _this = this;
        if (this._initializingMyLocations) {
            return;
        }
        // On Android when focusing on an input field the keyboard opening shrinks the height of the web view which
        // triggers a map resize event which triggers map panning. As a low impact solution to fix this we will just
        // skip map panning while the info window is open so the map position will not move when focusing on the input.
        if (this.isMobile && this._infoWindowOpen) {
            return;
        }
        this._map.setOptions({maxZoom:this._maxZoom});
        var bounds = new google.maps.LatLngBounds();
        if (this._myLocations.length) {
            for (var i=0; i<this._myLocations.length; i++) {
                bounds.extend(this._myLocations[i].marker.getPosition());
            }
            this._map.fitBounds(bounds);
            this._map.panToBounds(bounds);
        }
        else {
            this._skipRegionPanning = false;
            this._zoomOnRegion();
        }
        setTimeout(function() {
            _this._map.setOptions({maxZoom:null});
        },250); //Since Google Maps version 3.32 we must add a slight delay when
                //resetting the max zoom in order for the map to render correctly.
    },

    /**
     * Returns a string of either `residential` or `other` depending on the passed boolean.
     * @param isPrivateResidence
     * @returns {string}
     */
    _getTypeFromPrivateResidence : function(isPrivateResidence) {
        return isPrivateResidence ? 'residential' : 'other';
    },

    /**
     * Validates the places search autocomplete inside the dialog.
     * @returns {boolean}
     * @private
     */
    _validatePlacesSearch: function() {
        var elem = this.querySelector('#autoComplete');
        if (!this._autocompleteValue ||!this._autocompleteValue.trim()) {
            elem.setAttribute('error-message','Search for a location');
            return false;
        }
        if (!this._placeCoordinates) {
            elem.setAttribute('error-message','Must select an item from the search results');
            return false;
        }
        return true;
    },

    /**
     * Validates the places search autocomplete inside the dialog on blur.
     * @private
     */
    _validatePlacesSearchOnBlur: function() {
        var _this = this;
        setTimeout(function() {
            if (document.activeElement.getAttribute('is') === 'iron-input') {
                var parentInput = document.activeElement.parentNode;
                while (parentInput.nodeName !== 'PAPER-INPUT') {
                    parentInput = parentInput.parentNode;
                }
                if (parentInput.id === 'autoComplete') { return; }
            }
            _this.querySelector('#autoComplete').validate();
        },0);
    },

    /**
     * Validates the location name field inside the edit info window.
     * @returns {boolean}
     * @private
     */
    _validateInfoWindowLocationName: function() {
        return this._validateLocationName(this.querySelector('#infoWindowLocationName'),this._infoWindowLocationName);
    },

    /**
     * Validates the location name field inside the selected place info window.
     * @returns {boolean}
     * @private
     */
    _validatePlaceLocationName: function() {
        return this._validateLocationName(this.querySelector('#placeLocationName'),this._selectedPlace ? this._selectedPlace.name : null);
    },

    /**
     * Validates the location name field inside the pin drop info window.
     * @returns {boolean}
     * @private
     */
    _validatePinDropLocationName: function() {
        return this._validateLocationName(this.querySelector('#pinDropLocationName'),this._pinDropLocation ? this._pinDropLocation.name : null);
    },

    /**
     * Validates the location name field inside the dialog.
     * @returns {boolean}
     * @private
     */
    _validateDialogLocationName: function() {
        return this._validateLocationName(this.querySelector('#dialogLocationName'),this._dialogLocationName);
    },

    /**
     * Validates the location name input using the passed location name.
     * @param elem
     * @param locationName
     * @returns {boolean}
     * @private
     */
    _validateLocationName: function(elem, locationName) {
        this._locationNameValid = true;
        if (!locationName || !locationName.trim()) {
            elem.setAttribute('error-message','Must have a value');
            this._locationNameValid = false;
            return this._locationNameValid;
        }
        if (locationName.length > 60) {
            elem.setAttribute('error-message','60 characters maximum');
            this._locationNameValid = false;
            return this._locationNameValid;
        }
        if (locationName.indexOf('"') > -1) {
            elem.setAttribute('error-message','Cannot contain the " character');
            this._locationNameValid = false;
            return this._locationNameValid;
        }
        if (locationName.indexOf('\\') > -1) {
            elem.setAttribute('error-message','Cannot contain the \\ character');
            this._locationNameValid = false;
            return this._locationNameValid;
        }
        for (var i=0; i<this._myLocations.length; i++) {
            //Don't compare the location against itself.
            if (this._loadedLocation && this._loadedLocation === this._myLocations[i]) {
                continue;
            }
            if (this._myLocations[i].name === locationName) {
                elem.setAttribute('error-message','Name must be unique');
                this._locationNameValid = false;
                return this._locationNameValid;
            }
        }
        return this._locationNameValid;
    },

    /**
     * Listens for changes on the list of locations.
     * @param length
     * @private
     */
    _myLocationsUpdated: function(length) {
        //Always skip panning to the region when we have at least one location.
        this._skipRegionPanning = !!length;
        //Whenever we save or remove a location we will adjust the map bounds to include all the locations.
        if (length && !this._initializingMyLocations) {
            this._adjustBoundsAndPan();
        }
    },

    /**
     * Validates the edit location name input on change. We will ignore this event when the location name is changed programatically.
     * @private
     */
    _infoWindowNameChanged: function() {
        //We use this rather than an on-change on the paper-input because this does not fire on infoWindow blur on iOS.
        var elem = this.querySelector('#infoWindowLocationName');
        if (elem) {
            elem.validate();
        }
    },

    /**
     * Validates the selected place name input on change.
     * @private
     */
    _selectedPlaceNameChanged: function() {
        if (this._selectedPlace === null) {
            return;
        }
        var elem = this.querySelector('#placeLocationName');
        if (elem) {
            elem.validate();
        }
    },

    /**
     * Validates the pin drop name input on change.
     * @private
     */
    _pinDropNameChanged: function() {
        if (this._pinDropLocation === null) {
            return;
        }
        var elem = this.querySelector('#pinDropLocationName');
        if (elem) {
            elem.validate();
        }
    },

    /**
     * Validates the location name input inside the dialog on change.
     * @private
     */
    _dialogNameChanged: function() {
        if (this._dialogLocationName === null) {
            return;
        }
        var elem = this.querySelector('#dialogLocationName');
        if (elem) {
            elem.validate();
        }
    }
});