Polymer({
    is: 'voyent-wizard-panel',

    properties: {
        visible: {
            type: Boolean,
            value: false
        },
        /**
         * Zero based index of the selected page
         * @default 0
         */
        selected: {
            type: Number,
            notify: true,
            reflectToAttribute: true,
            observer: 'selectedChanged'
        },
        /**
         * Disable the previous/back button
         */
        previousdisabled: {
            type: Boolean,
            value: true,
            notify: true,
            reflectToAttribute: true
        },
        /**
         * Disable the next button
         */
        nextdisabled: {
            type: Boolean,
            value: false,
            notify: true,
            reflectToAttribute: true
        },
        /**
         * Text label of the previous/back button
         * @default Back
         */
        previouslabel: {
            type: String,
            value: "Back",
            notify: true,
            reflectToAttribute: true
        },
        /**
         * Text label of the next button
         * @default Next
         */
        nextlabel: {
            type: String,
            value: "Next",
            notify: true,
            reflectToAttribute: true
        },
        /**
         * Hide/unrender the previous/back button
         */
        previoushidden: {
            type: Boolean,
            value: false,
            notify: true,
            reflectToAttribute: true
        },
        /**
         * Hide/unrender the next button
         */
        nexthidden: {
            type: Boolean,
            value: false,
            notify: true,
            reflectToAttribute: true
        },
        entryanimation: {
            type: String,
            value: "dynamic",
            notify: true,
            reflectToAttribute: true
        },
        exitanimation: {
            type: String,
            value: "fade-out-animation",
            notify: true,
            reflectToAttribute: true
        },
    },
    
    ready: function() {
        this.useDynamicAnimation = (this.entryanimation === "dynamic");
        
        // Timeout set the default `selected`
        // This is so that any parent pages using the component can add their event listener in time
        //  to do initial setup based on selected=0 and the voyent-wizard-panel-changed event
        var _this = this;
        setTimeout(function() {
            _this.selected = 0;
        },0);
        
        if (this.getChildCount() <= 0) {
            console.error("No children pages found for voyent-wizard-panel");
        }
    },
    
    /**
     * Maintains the correct state for the previous and next buttons.
     * @param selected
     */
    selectedChanged: function(selected) {
        // Disable Back if we don't have a previous page, and similarly Next if we are at the end
        this.previousdisabled = (selected-1 < 0);
        this.nextdisabled = (selected+1 >= this.getChildCount());
        
        this.fire('voyent-wizard-panel-changed', { selected: this.selected });
    },
    
    /**
     * Increment the selected page number.
     */
    next: function() {
        if (this.useDynamicAnimation) {
            this.entryanimation = "slide-from-right-animation";        
        }
        this.selected++;
        
        this.fire('voyent-wizard-panel-next', { selected: this.selected });
    },
    
    /**
     * De-increment the selected page number.
     */
    previous: function() {
        if (this.useDynamicAnimation) {
            this.entryanimation = "slide-from-left-animation";
        }
        this.selected--;
        
        this.fire('voyent-wizard-panel-previous', { selected: this.selected });
    },
    
    getChildCount: function() {
        return this.querySelector('#pages').childElementCount;
    },
});
