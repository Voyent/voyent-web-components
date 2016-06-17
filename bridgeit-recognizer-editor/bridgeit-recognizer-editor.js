Polymer({
	is: "bridgeit-recognizer-editor",

    properties: {
        /**
         * Defines the BridgeIt account of the realm.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * Defines the BridgeIt realm to build recognizers for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String }
    },

    /**
     * Fired after the recognizers list is retrieved, this occurs on the initial load and whenever a CRUD operation is performed. Contains the list of saved recognizers.
     * @event recognizersRetrieved
     */

	ready: function() {
        if (!this.realm) {
            this.realm = bridgeit.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = bridgeit.io.auth.getLastKnownAccount();
        }
        if (bridgeit.io.auth.isLoggedIn()) {
            this.getRecognizers();
        }
        this._loadedRecognizer = null;
	},
    
    /**
     * Fetch the list of available recognizers from the Eventhub Service.
     */
    getRecognizers: function() {
        var _this = this;
        bridgeit.io.eventhub.findRecognizers({"realm":this.realm}).then(function(recognizers) {
            //save the list of recognizer IDs so we can check for uniqueness
            _this._ids = recognizers.map(function(recognizer) {
                return recognizer._id;
            });
            _this.fire('recognizersRetrieved',{recognizers:recognizers});
        }).catch(function(error) {
            _this.fire('message-error', 'Error in getRecognizers: ' + error.toSource());
        });
    },

    /**
     * Load an recognizer into the editor from JSON format.
     * @param recognizer
     */
    loadRecognizer: function(recognizer) {
        this._loadedRecognizer = recognizer;
        this._id = recognizer._id;
        this._active = !!recognizer.active;
        this._script = recognizer.script;
        this.fire('message-info', 'Loaded recognizer ' + this._id + ' with script ' + this._script.length + ' characters long');
    },

    /**
     * Save a new recognizer. Provide an id to override the value specified in the UI.
     * @param recognizerId
     */
    saveRecognizer: function(recognizerId) {
        var _this = this;
        recognizerId = recognizerId && recognizerId.trim().length > 0 ? recognizerId : this._id;
        if (!this.validateRecognizer() || !this.isUniqueRecognizerId(recognizerId)) {
            this.fire('message-error', 'Invalid data was found in recognizer, fix and try saving again');
            return;
        }
        var recognizer = {"_id":recognizerId,"active":!!this._active,"script":this._script};
        bridgeit.io.eventhub.createRecognizer({"realm":this.realm,"id":recognizerId,"recognizer":recognizer}).then(function() {
            _this._loadedRecognizer = recognizer;
            _this.getRecognizers();
            _this.fire('message-info', 'Successfully saved ' + _this._loadedRecognizer._id + ' recognizer');
        }).catch(function(error) {
            _this.fire('message-error', 'Error in saveRecognizer: ' + error.toSource());
        });
    },

    /**
     * Overwrite a previously saved recognizer.
     */
    updateRecognizer: function() {
        var _this = this;
        if (!this._loadedRecognizer || !this.validateRecognizer()) {
            this.fire('message-error', 'Invalid data was found in recognizer, fix and try updating again');
            return;
        }
        //check if the id has changed, if it has we must re-create the recognizer with the new id
        if (this._id != this._loadedRecognizer._id) {
            this._deleteAndSaveRecognizer();
        }
        else {
            var recognizer = {"active":!!this._active,"script":this._script};
            bridgeit.io.eventhub.updateRecognizer({"realm":this.realm,"id":this._id,"recognizer":recognizer}).then(function() {
                _this.getRecognizers();
                _this.fire('message-info', 'Successfully update ' + _this._id + ' recognizer');
            }).catch(function(error) {
                _this.fire('message-error', 'Error in updateRecognizer: ' + error.toSource());
            });
        }
    },

    /**
     * Delete the recognizer from the Recognizer Service.
     */
    deleteRecognizer: function(id) {
        var _this = this;
        bridgeit.io.eventhub.deleteRecognizer({"realm":this.realm,id:id}).then(function() {
            _this.resetEditor();
            _this.getRecognizers();
            _this.fire('message-info', 'Successfully deleted recognizer ' + id);
        }).catch(function(error) {
            _this.fire('message-error', 'Error in deleteRecognizer: '  + error.toSource());
        });
    },

    /**
     * Validate the recognizer.
     * @returns {boolean}
     */
    validateRecognizer: function() {
        //validate required fields
        if (!this._id || this._id.trim().length === 0) {
            this.fire('message-error', 'Missing a recognizer name/ID');
            return false;
        }
        if (!this._script || this._script.trim().length === 0) {
            this.fire('message-error', 'Missing script contents');
            return false;
        }
        if (this._script.indexOf('realmObservable') === -1) {
            this.fire('message-error', 'Script must contain "realmObservable" variable, cancelling create.');
            return false;
        }
        if (this._script.indexOf('recognizerObserver') === -1) {
            this.fire('message-error', 'Script must contain "recognizerObserver" variable, cancelling create.');
            return false;
        }
        return true;
    },

    /**
     * Check if the id is unique.
     * @param recognizerId
     * @returns {boolean}
     */
    isUniqueRecognizerId: function(recognizerId) {
        if (this._ids.indexOf(recognizerId) > -1) {
            this.fire('message-error', 'The recognizer "' + recognizerId + '" is already in use, please try a different one.');
            return false;
        }
        return true;
    },

    /**
     * Reset the editor.
     */
    resetEditor: function() {
        this._id = '';
        this._active = false;
        this._loadedRecognizer = null;
        this.set('_script', '');
        this.fire('message-info', 'Reset the recognizer editor');
    },

    //******************PRIVATE API******************

    /**
     * Wrapper for `saveRecognizer()`.
     * @private
     */
    _saveRecognizer: function() {
        this.saveRecognizer();
    },

    /**
     * Wrapper for `updateRecognizer()`.
     * @private
     */
    _updateRecognizer: function() {
        this.updateRecognizer();
    },

    /**
     * Wrapper for `saveRecognizer()`. Prompts for a new id to use for the cloned recognizer.
     * @private
     */
    _cloneRecognizer: function() {
        var recognizerId = window.prompt("Please enter the new recognizer name");
        if (recognizerId === null) {
            return;
        }
        this.saveRecognizer(recognizerId);
    },

    /**
     * Wrapper for `deleteRecognizer()`. Adds a confirm dialog.
     * @private
     */
    _deleteRecognizer: function() {
        if (!this._loadedRecognizer || !this._loadedRecognizer._id) {
            return;
        }
        
        var confirm = window.confirm("Are you sure you want to delete '" + this._loadedRecognizer._id + "'? This cannot be undone!");
        if (!confirm) {
            return;
        }
        
        this.deleteRecognizer(this._loadedRecognizer._id);
    },

    /**
     * Update an existing recognizer when the id changes.
     * @private
     */
    _deleteAndSaveRecognizer: function() {
        var _this = this;
        bridgeit.io.eventhub.deleteRecognizer({"realm":this.realm,id:this._loadedRecognizer._id}).then(function() {
            _this._loadedRecognizer._id = _this._id;
            _this.saveRecognizer();
        }).catch(function(error) {
            _this.fire('message-error', 'Error in updateRecognizer: ' + error.toSource());
        });
    },

    /**
     * Wrapper for `resetEditor()`.
     * @private
     */
    _resetEditor: function() {
        this.resetEditor();
    }
});