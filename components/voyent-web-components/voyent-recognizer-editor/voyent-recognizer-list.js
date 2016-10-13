Polymer({
    is: "voyent-recognizer-list",
    
    properties: {
        /**
         * Selected index of the saved recognizers dropdown
         */
        selectedIndex: { type: Number, notify: true, observer: '_selectedIndexChanged' },
    },
    
    ready: function() {
        this._setupListener();
    },


    //******************PRIVATE API******************

    /**
     * Adds an event listener for the `recognizersRetrieved` event.
     */
    _setupListener: function() {
        var _this = this;
        Polymer.dom(this).parentNode.addEventListener('recognizersRetrieved', function(e) {
            _this._allRecognizers = e.detail.recognizers.length > 0 ? e.detail.recognizers : null;
            _this._allRecognizers.sort(_this._sortList);
        });
    },

    /**
     * Loads the selected recognizer.
     * @param e
     * @private
     */
    _loadRecognizer: function() {
        if (typeof this.selectedIndex !== 'undefined' && this.selectedIndex >= 0 && this.selectedIndex <= (this._allRecognizers.length-1)) {
            Polymer.dom(this).parentNode.loadRecognizer(this._allRecognizers[this.selectedIndex]);
            var _this = this;
            setTimeout(function() {
                _this.set('selectedIndex', null);
            },2000);
        }
        else {
            this.fire('message-error', 'Select a recognizer to view');
            console.error('Select a recognizer to view');
        }
    },
    
    /**
     * Sorts the list of recognizers alphabetically.
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
            this._loadRecognizer();
        }
    },
});