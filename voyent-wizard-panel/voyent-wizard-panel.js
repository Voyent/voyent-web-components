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

    /**
     * Maintains the correct state for the previous and next buttons.
     * @param selected
     */
    selectedChanged: function(selected) {
        var childCount = this.querySelector('#pages').childElementCount;
        if (selected === 0) {
            this.previousDisabled = true;
        }
        else if (selected === childCount-1) {
            this.nextDisabled = true;
        }
        else if (selected > 0) {
            this.previousDisabled = false;
            if (selected < childCount-1) {
                this.nextDisabled = false;
            }
        }
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
