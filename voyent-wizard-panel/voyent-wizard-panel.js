Polymer({
    is: 'voyent-wizard-panel',

    properties: {
        visible: {
            type: Boolean,
            value: false
        },
        selected: {
            type: Number,
            value: 0,
            observer: 'selectedChanged'
        },
        previousDisabled: {
            type: Boolean,
            value: true
        },
        nextDisabled: {
            type: Boolean,
            value: false
        }
    },
    
    ready: function() {
        var childCount = this.querySelector('#pages').childElementCount;
        if (childCount <= 0) {
            console.error("No children pages found for voyent-wizard-panel");
        }
    },
    
    /**
     * Maintains the correct state for the previous and next buttons.
     * @param selected
     */
    selectedChanged: function(selected) {
        var childCount = this.querySelector('#pages').childElementCount;

        // Disable Back if we don't have a previous page, and similarly Next if we are at the end
        this.previousDisabled = (selected-1 < 0);
        this.nextDisabled = (selected+1 >= childCount);
    },
    /**
     * Increment the selected page number.
     */
    next: function() {
        this.selected++;
    },
    /**
     * De-increment the selected page number.
     */
    previous: function() {
        this.selected--;
    }
});
