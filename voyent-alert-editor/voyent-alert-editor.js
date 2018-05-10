Polymer({
    is: 'voyent-alert-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    /**
     * Fires when the loaded alert changes. Includes an `alert` property that contains the loaded alert or null if none is loaded.
     * @event voyent-alert-template-changed
     */

    properties: {
        /**
         * Indicates whether an alert is currently being fetched from database and loaded into the editor.
         */
        isAlertLoading: { type: Boolean, value: false, readOnly: true, notify: true, observer: '_isAlertLoading' },
        /**
         * Indicates whether an alert is currently loaded in the editor.
         */
        isAlertLoaded: { type: Boolean, value: false, readOnly:true, notify: true },
        /**
         * The currently loaded alert state.
         */
        alertState: { type: String, value: null, readOnly:true, notify: true }
    },

    observers: [
        '_showPropertiesPaneChanged(_showPropertiesPane)',
        '_loadedAlertChanged(_loadedAlert)',
        '_alertStateChanged(_loadedAlert.template.state)'
    ],

    ready: function() {
        //Initialize parentTemplate list with a fake element so the "no templates found"
        //message won't flicker in the sidebar while we are fetching the templates.
        this._parentTemplatesByCategory = ['tmp'];
    },

    /**
     * Loads an alert into the editor using the passed id.
     * @param id
     */
    loadAlert: function(id) {
        this._setIsAlertLoading(true);
        var _this = this;
        var promises = [];
        promises.push(this._fetchAlertTemplate(id));
        promises.push(this._fetchLocationRecord(id));
        Promise.all(promises).then(function(results) {
            //Clear the map of any loaded alert template before drawing.
            if (_this._loadedAlert) {
                _this.clearMap();
            }
            var template = results[0];
            var latLng = null;
            if (template.geo) {
                latLng = new google.maps.LatLng(
                    results[1].location.geometry.coordinates[1],
                    results[1].location.geometry.coordinates[0]
                );
            }
            //Set this flag so the center_changed listener will not fire for each circular zone that is drawn.
            _this._ignoreZoneCenterChangedEvent = true;
            _this._drawAndLoadAlertTemplate(template,latLng);
            //Toggle the correct pane.
            _this._showPropertiesPane = true;
            _this._setIsAlertLoading(false);
            //Populate the movement pane, async so the properties panel has time to initialize.
            setTimeout(function() {
                _this._ignoreZoneCenterChangedEvent = false;
                if (typeof template.properties.direction !== 'undefined') {
                    _this.set('_alertDirection',template.properties.direction);
                }
                if (typeof template.properties.speed !== 'undefined') {
                    _this.set('_alertSpeed',template.properties.speed);
                    _this.set('_alertSpeedUnit',template.properties.speedUnit || 'kph');
                }
            },0);
        }).catch(function(error) {
            _this.fire('message-error', 'Issue loading saved alert: ' + (error.responseText || error.message || error));
        });
    },

    /**
     * Prompts the user to create a new alert.
     */
    addNew: function() {
        var _this = this;
        //Ensure we start with a clean state.
        this.set('_selectedAlertTemplateId',null);
        this._sortTemplatesBy = 'name';
        this._lastSortOrderName = 'ascending';
        this._lastSortOrderCategory = 'ascending';
        this.set('_templateSearchQuery','');
        //Fetch the list of categories and templates before opening the dialog. Fetch the
        //categories first because we need them to build our list of categorized templates.
        var errMsg = 'Problem initializing editor, please try again';
        this._fetchTemplateCategories().then(function() {
            _this._fetchAlertTemplates().then(function() {
                _this._openNewAlertDialog();
            }).catch(function() {
                _this.fire('message-error',errMsg);
                _this._cancelNewAlert();
            });
        }).catch(function() {
            _this.fire('message-error',errMsg);
            _this._cancelNewAlert();
        });
    },

    /**
     * Handles persisting the alert as active or scheduled. The alerts may be revised or rescheduled by the service.
     * @returns {*}
     */
    activateAlert: function() {
        var _this = this;
        if (!this._loadedAlert || !this._loadedAlert.template) {
            return this.fire('message-error', 'Unable to active alert: No alert loaded');
        }
        var activatableStates = ['draft','active','scheduled'];
        if (activatableStates.indexOf(this._loadedAlert.template.state) === -1) {
            return this.fire('message-error', 'Unable to activate alert: State cannot be transitioned from ' + this._loadedAlert.template.state);
        }
        var isNewActivation = !this._loadedAlert.template.id || this._loadedAlert.template.state === 'draft';
        this._loadedAlert.template.setState(this._loadedAlert.template.hasSchedule() ? 'scheduled' : 'active');
        this._saveAlert().then(function() {
            if (isNewActivation) {
                if (_this._loadedAlert.template.state === 'scheduled') {
                    _this.fire('message-info', 'New alert scheduled');
                }
                else {
                    _this.fire('message-info', 'New alert activated');
                }
            }
            else {
                if (_this._loadedAlert.template.state === 'scheduled') {
                    _this.fire('message-info', 'Alert successfully rescheduled');
                }
                else {
                    _this.fire('message-info', 'Alert successfully revised');
                }
            }
        }).catch(function(e) {});
    },

    /**
     * Previews the currently loaded alert and returns the event that was fired. This will trigger calculations on
     * the service which will result in a push notification to the browser containing the preview data.
     * @returns {*}
     */
    previewAlert: function() {
        var _this = this;
        if (!this._loadedAlert || !this._loadedAlert.template) {
            return this.fire('message-error', 'Unable to preview alert: No alert loaded');
        }

        var event = this._buildPreviewEvent();
        voyent.event.createCustomEvent({event:event}).then(function() {
        }).catch(function(e) {
            _this.fire('message-error', 'Unable to preview alert: ' + (e.responseText || e.message || e));
        });
        return event;
    },

    /**
     * Saves the alert currently loaded in the editor as an alert template.
     */
    saveAsAlertTemplate: function() {
        var _this = this;
        if (!this._loadedAlert || !this._loadedAlert.template) {
            return this.fire('message-error', 'Unable to save alert as template: No alert loaded');
        }
        this._openDialog(null,null,'Save Location With Template?',false,false,function() {
            _this._loadedAlert.template.setSavePosition(_this._dialogToggle);
            var id = _this._loadedAlert.template.id;
            var parentId = _this._loadedAlert.template.parentId;
            _this._loadedAlert.template.setId(null);
            _this._loadedAlert.template.setParentId(null);
            _this._saveAlertTemplate().then(function() {
                done();
                _this.fire('message-info', 'Successfully saved alert as template');
            }).catch(function(e) {
                if (e !== 'already saving template') {
                    _this.fire('message-error', 'Problem saving alert as template: ' + (e.responseText || e.message || e));
                    done();
                }
            });
            function done() {
                _this._loadedAlert.template.setSavePosition(false);
                _this._loadedAlert.template.setId(id);
                _this._loadedAlert.template.setParentId(parentId);
            }
        });
    },

    /**
     * Removes the currently loaded alert from the database.
     */
    removeAlert: function() {
        var _this = this;
        this._promptForRemoval(function() {
            _this._showPropertiesPane = false;
            _this._removeAlert();
        });
    },

    /**
     * Transition an alert state from one state to another.
     * @param state
     * @returns {*}
     */
    updateAlertState: function(state) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var validStates = ['draft','scheduled','active','deprecated','ended'];
            if (validStates.indexOf(state) === -1) {
                var rejectMsg = 'Unable to change alert state: State ' + _this._loadedAlert.template.state + ' is invalid';
                _this.fire('message-error',rejectMsg);
                return reject(rejectMsg);
            }
            _this._loadedAlert.template.setState(state);
            voyent.locate.updateAlertState({"realm":_this.realm,"id":_this._loadedAlert.template.id,"state":state}).then(function() {
                resolve();
            }).catch(function(error) {
                reject(error);
                _this.fire('message-error', 'Unable to change alert state: ' + (error.responseText || error.message || error));
            });
        });
    },

    /**
     * Returns a JSON representation of the currently loaded alert.
     * @returns {*}
     */
    getCurrentAlert: function() {
        if (this._loadedAlert && this._loadedAlert.template) {
            this._loadedAlert.template.updateJSON(true);
            return this._loadedAlert.template.json;
        }
        return null;
    },

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        this._isLoggedIn = true; //Toggle for side panel.
        this._fetchRealmRegion();
        this._enableDefaultPane();
    },

    /**
     * Fetches the latest alert templates for the realm.
     * @returns {*}
     * @private
     */
    _fetchAlertTemplates: function() {
        var _this = this;
        return new Promise(function (resolve, reject) {
            //Make sure we don't fetch the templates an unnecessary amount of times.
            if (_this._isFetchingTemplates) { return resolve(); }
            _this._isFetchingTemplates = true;
            voyent.locate.findAlertTemplates({"realm":_this.realm,"query": {"properties.parentAlertId":{"$exists":false}},
                "options":{"sort":{"lastUpdated":-1}}}).then(function(templates) {
                if (!templates || !templates.length) {
                    _this.set('_parentTemplatesByCategory',[]);
                    _this.set('_filteredParentTemplatesByCategory',[]);
                }
                else {
                    _this.set('_parentTemplatesByCategory',_this._duplicateTemplatesByCategory(templates));
                    _this.set('_filteredParentTemplatesByCategory',_this._parentTemplatesByCategory.slice(0));
                }
                _this._isFetchingTemplates = false;
                resolve(_this._parentTemplatesByCategory);
            }).catch(function (error) {
                _this.fire('message-error', 'Issue fetching alert templates: ' + (error.responseText || error.message || error));
                reject(error);
            });
        });
    },

    /**
     * Creates an object map of templates so that there is one an entry for every valid category they belong to.
     * @param templates
     * @private
     */
    _duplicateTemplatesByCategory: function(templates) {
        var templatesDuplicatedByCategory = [];
        for (var i=0; i<templates.length; i++) {
            var template = templates[i];
            if (template.categories && template.categories.length) {
                for (var j=template.categories.length-1; j>=0; j--) {
                    templatesDuplicatedByCategory.push({
                        "template": template,
                        "category": template.categories[j]
                    });
                }
            }
            else {
                templatesDuplicatedByCategory.push({
                    "template": template,
                    "category": template.isDefaultTemplate ? "Predefined" : "Uncategorized"
                });
            }
        }
        return templatesDuplicatedByCategory;
    },

    /**
     * Opens the dialog for creating a new alert.
     * @private
     */
    _openNewAlertDialog: function() {
        var dialog = this.querySelector('#newAlertDialog');
        if (dialog) {
            dialog.open();
        }
    },

    /**
     * Closes the dialog for creating a new alert.
     */
    closeNewAlertDialog: function() {
        var dialog = this.querySelector('#newAlertDialog');
        if (dialog) {
            dialog.close();
        }
    },

    /**
     * Handles submitting the new alert dialog via key press.
     * @param e
     * @private
     */
    _submitNewAlertDialog: function(e) {
        e.stopPropagation();
        if (e.keyCode === 13) { //Enter
            this._createNewAlert();
        }
        else if (e.keyCode === 27) { //Escape
            this._cancelNewAlert();
        }
    },

    /**
     * Handles filtering the templates based on user input.
     * @private
     */
    _templateSearchQueryKeyUp: function() {
        this._queryTemplates(this._templateSearchQuery);
    },

    /**
     * Queries the template names and categories against the passed search query.
     * @param searchQuery
     * @private
     */
    _queryTemplates: function(searchQuery) {
        //Always execute the search query against a complete list so
        //changes made via backspace, copy/paste, etc.. are applied properly.
        this.set('_filteredParentTemplatesByCategory',this._parentTemplatesByCategory.slice(0));
        //Just return the entire template set if no query is specified.
        if (!searchQuery || !searchQuery.trim()) {
            return;
        }
        var searchQueryKeywords = searchQuery.toLowerCase().split(' ');
        for (var i=this._filteredParentTemplatesByCategory.length-1; i>=0; i--) {
            var matchCount = 0;
            for (var j=0; j<searchQueryKeywords.length; j++) {
                var keyword = searchQueryKeywords[j];
                //Ignore extra spaces.
                if (!keyword) {
                    matchCount++;
                    continue;
                }
                //Consider the keyword a match if it is found in either the name or category of the template.
                if (this._filteredParentTemplatesByCategory[i].template.name.toLowerCase().indexOf(keyword) > -1 ||
                    this._filteredParentTemplatesByCategory[i].category.toLowerCase().indexOf(keyword) > -1) {
                    matchCount++;
                }
            }
            //All keywords must match in order for the result to be included.
            if (matchCount !== searchQueryKeywords.length) {
                this.splice('_filteredParentTemplatesByCategory',i,1);
            }
        }
        //Automatically select the template if there is only one result from filtering.
        if (this._filteredParentTemplatesByCategory.length === 1) {
            this.set('_selectedAlertTemplateId',this._filteredParentTemplatesByCategory[0].template._id);
        }
    },

    /**
     * Handles confirmation from the new alert dialog. Validates the dialog, builds the child template and closes the dialog.
     * @private
     */
    _createNewAlert: function() {
        if (!this._selectedAlertTemplateId) {
            this.fire('message-error','Must select an alert template');
            return;
        }
        var _this = this;
        //Find and clone the parent template that we will create the child from.
        var childTemplate = JSON.parse(JSON.stringify(this._parentTemplatesByCategory.filter(function(alertTemplateByCategory) {
            return alertTemplateByCategory.template._id === _this._selectedAlertTemplateId;
        })[0].template));
        //Load the template immediately if it has a center position defined or no geo section (fallback zone only).
        if (childTemplate.properties.center || !childTemplate.geo) {
            var position = null;
            if (childTemplate.properties.center) {
                position = new google.maps.LatLng(childTemplate.properties.center);
                delete childTemplate.properties.center;
            }
            this._createChildTemplate(childTemplate,position);
        }
        else {
            this._displayClickMapMsg = true;
            this.fire('message-info','Click a location on the map to place the alert...');
            //Change the cursor to a crosshair for accurate placement
            this._map.setOptions({draggableCursor:'crosshair'});
            //Add click listeners to the map so we can drop the new alert wherever they click. First clear the
            //listener to ensure that the user can click multiple alerts and always get the last one the selected.
            google.maps.event.clearListeners(this._map,'click');
            google.maps.event.addListener(this._map,'click',createChildTemplate);
            //Create a new child alert template to be linked one-to-one with the alert.
            function createChildTemplate(e) { _this._createChildTemplate(childTemplate,e.latLng); }
        }
        this.closeNewAlertDialog();
    },

    /**
     * Draws the passed template and converts it to a child template by adding the parenAlertId property.
     * @param childTemplate
     * @param latLng
     * @private
     */
    _createChildTemplate: function(childTemplate,latLng) {
        //Remove the parent's id from the record as we'll generate a new one.
        var id = childTemplate._id;
        delete childTemplate._id;
        //If we have no geo section it means the template contains only the fallback
        //zone so the coordinates they dropped the template at are meaningless.
        if (!childTemplate.geo) { latLng = null; }
        childTemplate.state = 'draft'; //Default to draft
        this._drawAndLoadAlertTemplate(childTemplate,latLng);
        this._loadedAlert.template.setParentId(id);
        this._showPropertiesPane = true;
        this._displayClickMapMsg = false;
    },

    /**
     * Cancels new alert creation by firing the `voyent-alert-template-cancel` event.
     * @private
     */
    _cancelNewAlert: function() {
        var _this = this;
        //Add some checks here since this function is called on window keydown
        //events, meaning it may fire when the component is not active.
        var dialog = this.querySelector('#newAlertDialog');
        if ((dialog && dialog.opened) || this._selectedAlertTemplateId) {
            this.closeNewAlertDialog();
            setTimeout(function() {
                _this.fire('voyent-alert-template-cancel',{});
            },0);
        }
    },

    /**
     * Sorts the template list by name.
     * @private
     */
    _sortTemplatesByName: function() {
        this._sortTemplatesBy = 'name';
        this._lastSortOrderName = this._lastSortOrderName === 'ascending' ? 'descending' : 'ascending';
        this.querySelector('#alertTemplatesList').render();
    },

    /**
     * Sorts the template list by category.
     * @private
     */
    _sortTemplatesByCategory: function() {
        this._sortTemplatesBy = 'category';
        this._lastSortOrderCategory = this._lastSortOrderCategory === 'ascending' ? 'descending' : 'ascending';
        this.querySelector('#alertTemplatesList').render();
    },

    /**
     * Sorting function for the list of categorized parent templates.
     * @param a
     * @param b
     * @returns {number}
     * @private
     */
    _sortTemplates: function(a,b) {
        if (this._sortTemplatesBy === 'name') {
            if (this._lastSortOrderName === 'ascending') {
                return a.template.name.toLocaleLowerCase().localeCompare(b.template.name.toLocaleLowerCase());
            }
            return b.template.name.toLocaleLowerCase().localeCompare(a.template.name.toLocaleLowerCase());
        }
        else {
            if (this._lastSortOrderCategory === 'ascending') {
                return a.category.toLocaleLowerCase().localeCompare(b.category.toLocaleLowerCase());
            }
            return b.category.toLocaleLowerCase().localeCompare(a.category.toLocaleLowerCase());
        }
    },

    /**
     * Sets the side panel to the default view.
     * @private
     */
    _enableDefaultPane: function() {
        this._showTemplateListPane = true;
        this._showPropertiesPane = false;
    },

    /**
     * Revert the cursor state from the alert icon to the regular pointer.
     * @private
     */
    _revertCursor: function() {
        if (this._selectedAlertTemplateId) {
            this._map.setOptions({draggableCursor:''});
            //Clear the listeners to remove the temporary click
            //listener but make sure we re-add the permanent one.
            google.maps.event.clearListeners(this._map,'click');
            this._deselectStacksOnClick(this._map);
            this._selectedAlertTemplateId = null;
        }
    },

    /**
     * Removes the currently active alert.
     * @private
     */
    _removeAlert: function() {
        var _this = this;
        //Just delete the alert, the location service will handle deleting the associated child template.
        if (this._loadedAlert.template.id) {
            voyent.locate.deleteAlert({
                account:this.account,
                realm:this.realm,
                id:this._loadedAlert.template.id
            }).then(function() {
                _this._removeAlertTemplateFromMap();
            }).catch(function(error) {
                _this.fire('message-error', 'Issue deleting alert: ' + (error.responseText || error.message || error));
            });
        }
        else {
            _this._removeAlertTemplateFromMap();
        }
    },

    /**
     * Opens a confirmation prompt for removing an alert.
     * @param func
     * @private
     */
    _promptForRemoval: function(func) {
        if (!this._loadedAlert) { return; }
        var msg = 'Are you sure you want to delete ' + this._loadedAlert.template.name + '? This cannot be undone!';
        this._openDialog(msg,null,null,false,false,func);
    },

    /**
     * Fabricates a location create event so we can generate preview metrics.
     * @returns Object {}
     * @private
     */
    _buildPreviewEvent: function() {
        this._loadedAlert.template.updateJSON(true);
        this._loadedAlert.template.json.state = 'preview';

        var alertId = this._loadedAlert.template.id || 'preview';

        var currentLocation = this._buildAlertLocationJSON().location;
        if (!currentLocation.properties.alertId) {
            currentLocation.properties.alertId = alertId;
        }

        return {
            "time": new Date().toISOString(),
            "account": this.account,
            "realm": this.realm,
            "service": "locate",
            "event": "create",
            "type": "location",
            "username": voyent.auth.getLastKnownUsername(),
            "tx": "",
            "data": {
                "resourceId": alertId,
                "origin": window.location.hostname,
                "previousLocation": {}, //This isn't being used by the modules currently so don't bother including it.
                "currentLocation": currentLocation,
                "alert": this._loadedAlert.template.json,
                "alertId" : alertId,
                "previewMetricsId":this._generateUid()
            }
        };
    },

    /**
     * Handles state related to the toggling of the properties pane.
     * @param showPropertiesPane
     * @private
     */
    _showPropertiesPaneChanged: function(showPropertiesPane) {
        this._showTemplateListPane = !showPropertiesPane;
        if (showPropertiesPane) {
            this._revertCursor();
        }
    },

    /**
     * Monitors the loaded alert and handles fallback zone button visibility.
     * @param loadedAlert
     * @private
     */
    _loadedAlertChanged: function(loadedAlert) {
        if (loadedAlert) {
            this._addAlertTemplateButtons();
        }
        //Don't bother removing the buttons if we are loading an alert as they will just be added again.
        else if (!this.isAlertLoading) {
            this._removeAlertTemplateButtons();
        }
        this._setIsAlertLoaded(loadedAlert && loadedAlert.template);
        this.fire('voyent-alert-changed',{
            'alert': loadedAlert || null
        });
    },

    /**
     * Keeps the alertState property in sync with the loaded alert state.
     * @param state
     * @private
     */
    _alertStateChanged: function(state) {
        this._setAlertState(state || null);
    }
});
