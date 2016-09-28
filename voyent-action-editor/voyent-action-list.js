Polymer({
    is: "voyent-action-list",
    
    properties: {
        /**
         * Selected index of the saved actions dropdown
         */
        selectedIndex: { type: Number, notify: true, observer: '_selectedIndexChanged' },
    },

    /**
     * Ready call to initialize this component, namely setting up our listener
     */
    ready: function() {
        this._setupListener();
    },

    //******************PRIVATE API******************

    /**
     * Adds an event listener for the `actionsRetrieved` event.
     */
    _setupListener: function() {
        var _this = this;
        Polymer.dom(this).parentNode.addEventListener('actionsRetrieved', function(e) {
            _this._allActions = e.detail.actions.length > 0 ? e.detail.actions : null;
            if (_this._allActions) {
                _this._allActions.sort(_this._sortList);
            }
        });
    },

    /**
     * Loads the selected action.
     * @private
     */
    _loadAction: function() {
        if (typeof this.selectedIndex !== 'undefined' && this.selectedIndex >= 0 && this.selectedIndex <= (this._allActions.length-1)) {
            var _this = this;
            Polymer.dom(this).parentNode.loadAction(this._allActions[this.selectedIndex], function() {
                setTimeout(function() {
                    _this.set('selectedIndex', null);
                },2000);
            });
        }
        else {
            this.fire('message-error', 'Select an action to view');
        }
    },
    
    /**
     * Sorts the list of actions alphabetically.
     * @param a
     * @param b
     * @returns {number}
     * @private
     */
    _sortList: function(a,b) {
        a = a._id.toLowerCase();
        b = b._id.toLowerCase();
        if (a < b) { return -1; }
        else if (a > b) { return  1; }
        return 0;
    },
    
    /**
     * Fired when the selectedIndex changes
     * If we have a valid new index we try to load it
     */
    _selectedIndexChanged: function() {
        if (typeof this.selectedIndex !== 'undefined' && this.selectedIndex !== null) {
            this._loadAction();
        }
    }
});