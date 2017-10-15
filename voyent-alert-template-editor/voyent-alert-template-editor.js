Polymer({
    is: 'voyent-alert-template-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    /**
     * Fires when the loaded alert template changes. Includes an `alertTemplate`
     * property that contains the loaded template or null if none is loaded.
     * @event voyent-alert-template-changed
     */

    properties: {
        /**
         * Indicate whether to hide the embedded save and cancel buttons.
         * @default false
         */
        hideButtons: { type: Boolean, value: false },
        /**
         * Indicates whether a template is currently being fetched from database and loaded into the editor.
         */
        isTemplateLoading: { type: Boolean, value: false, readOnly: true, notify: true, observer: '_isAlertLoading' },
        /**
         * Indicates whether a template is currently loaded in the editor.
         */
        isTemplateLoaded: { type: Boolean, value: false, readOnly:true, notify: true }
    },

    observers: [
        '_loadedAlertChanged(_loadedAlert)'
    ],

    /**
     * Loads an alert template into the editor using the passed id.
     * @param id
     */
    loadAlertTemplate: function(id) {
        this._setIsTemplateLoading(true);
        this._closeDialog(); //Ensure the dialog is closed.
        this._drawingManager.setDrawingMode(null); //Ensure drawing mode is disabled.
        var _this = this;
        this._fetchAlertTemplate(id).then(function(template) {
            //Clear the map of any loaded alert template before drawing.
            if (_this._loadedAlert) {
                _this.clearMap();
            }
            _this._drawAndLoadAlertTemplate(template);
            _this._setIsTemplateLoading(false);
        }).catch(function (error) {
            _this.fire('message-error', 'Error loading saved alert template: ' + (error.responseText || error.message || error));
        });
    },

    /**
     * Opens a confirmation prompt for cancelling alert template creation or edits.
     * @private
     */
    cancel: function() {
        var msg;
        if (this._loadedAlert.template.id) {
            msg = 'Are you sure you want to revert all unsaved changes for "' +
                this._loadedAlert.template.name + '"? This action cannot be undone.';
        }
        else {
            msg = 'Are you sure you want to cancel creating ' +
                this._loadedAlert.template.name + '? This action cannot be undone.';
        }
        this._openDialog(msg,null,'clearMap');
    },


    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        this._isLoggedIn = true; //Toggle for side panel.
        //Fetch the regions for the realm so we can populate the map with the current region.
        this._fetchRealmRegion();
    },

    /**
     * Removes the current alert template.
     * @private
     */
    _removeAlertTemplate: function() {
        var _this = this;
        //Delete from DB if it's saved.
        if (this._loadedAlert.template.id) {
            voyent.locate.deleteAlertTemplate({
                realm: this.realm,
                account: this.account,
                id: this._loadedAlert.template.id
            }).then(function() {
                _this._removeAlertTemplateFromMap();
            }).catch(function (error) {
                _this.fire('message-error', 'Issue deleting alert template: ' + (error.responseText || error.message || error));
            });
        }
        else {
            _this._removeAlertTemplateFromMap();
        }
    },

    /**
     * Manages the templateLoaded property state, drawing button visibility
     * and fires the `voyent-alert-template-changed` event.
     * Manages the drawing button states based on whether an alert is loaded.
     * @param loadedAlert
     * @private
     */
    _loadedAlertChanged: function(loadedAlert) {
        if (loadedAlert) {
            this._addAlertTemplateButtons();
        }
        //Don't bother removing the buttons if we are loading a template as they will just be added again.
        else if (!this.isTemplateLoading) {
            this._removeAlertTemplateButtons();
        }
        this._setIsTemplateLoaded(loadedAlert && loadedAlert.template);
        this.fire('voyent-alert-template-changed',{
            'alertTemplate': loadedAlert && loadedAlert.template ? loadedAlert.template : null
        });
    }
});
