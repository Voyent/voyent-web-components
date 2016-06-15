Polymer({
    is: "bridgeit-action-list",
    
    properties: {
        /**
         * Selected index of the saved actions dropdown
         */
        selectedIndex: { type: Number, notify: true },
    },

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
            _this._allActions.sort(_this._sortList);
        });
    },

    /**
     * Loads the selected action.
     * @param e
     * @private
     */
    _loadAction: function(e) {
        if (typeof this.selectedIndex !== 'undefined' && this.selectedIndex >= 0 && this.selectedIndex <= (this._allActions.length-1)) {
            Polymer.dom(this).parentNode.loadAction(this._allActions[this.selectedIndex]);
        }
        else {
            this.fire('message-error', 'Select an action to view');
        }
    },
    
    /**
     * Deletes the selected action.
     * @param e
     * @private
     */
    _deleteAction: function(e) {
        if (typeof this.selectedIndex !== 'undefined' && this.selectedIndex >= 0 && this.selectedIndex <= (this._allActions.length-1)) {
            var confirm = window.confirm("Are you sure? This cannot be undone!");
            if (!confirm) {
                return;
            }
            
            Polymer.dom(this).parentNode.deleteAction(this._allActions[this.selectedIndex]._id);
        }
        else {
            this.fire('message-error', 'Select an action to delete');
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
    }
});