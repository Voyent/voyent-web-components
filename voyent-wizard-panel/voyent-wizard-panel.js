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
            value: 0,
            observer: 'selectedChanged'
        },
        /**
         * Zero based index of how many layers deep the user is, for dynamic wizards
         * @default 0
         */
        step: {
            type: Number,
            value: 0,
            notify: true,
            reflectToAttribute: true
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
        /**
         * Disable the Enter key automatically submitting the Next button
         * By default this is enabled, but will only work if nexthidden and nextdisabled are false
         * @value false
         */
        disableenterkey: {
            type: Boolean,
            value: false
        },
        /**
         * Added to account for changing internal panel #s caused by repeat or conditional templates.
         */
        childcount:{
            type:Number,
            value:0,
            notify:true,
            observer:'childCountChanged'
        },
    },
    
    ready: function() {
        this.useDynamicAnimation = (this.entryanimation === "dynamic");
        this.validators = [];
        
        // Timeout set the default `selected`
        // This is so that any parent pages using the component can add their event listener in time
        //  to do initial setup based on selected=0 and the voyent-wizard-panel-changed event
        var _this = this;
        setTimeout(function() {
            _this.selected = 0;
        },0);
        
        if (this._getChildCount() <= 0) {
            console.error("No children pages found for voyent-wizard-panel");
        }
    },
    
    /**
     * Maintains the correct state for the previous and next buttons.
     * @param selected
     */
    selectedChanged: function(selected) {
        // Disable Back if we don't have a previous page, and similarly Next if we are at the end
        this.updateDisabled();

        this.fire('voyent-wizard-panel-changed', { selected: this.selected });
    },

    updateDisabled:function(){
        this.previousdisabled = (this.getLastReal() === -1);
        this.nextdisabled = (this.getNextReal() === -1);
    },
    
    /**
     * Attach a validation function to a certain selected index
     * The passed function needs to return a boolean true/false
     * The step is not zero based, but relates to the currently selected pane of the wizard
     * Whenever Next is clicked any attached validator on that step will be fired, and if it returns false
     *  the Next panel switching will be aborted
     *
     * @param step non-zero index to attach to
     * @param parent context to use in the function call, should be "this" of the parent
     * @param validatorFn validation function that returns true/false
     */
    attachValidator: function(step, parent, validatorFn) {
         // Account for zero index by doing step-1
        this.validators[step-1] = { "parent": parent, "fn": validatorFn };
    },
    
    /**
     * Go to next real page, increment the step number.
     */
    next: function() {
        // Check for any attached validators
        var valid = true;
        if (this.validators[this.selected]) {
            // Call the underlying validation function, and pass in the parent "this"
            valid = this.validators[this.selected].fn.call(this.validators[this.selected].parent);
        }
        
        // Only continue processing if we're valid
        if (valid) {
            if (this.useDynamicAnimation) {
                this.entryanimation = "slide-from-right-animation";        
            }
            this.selected = this.getNextReal() ;
            this.step++;
            this.fire('voyent-wizard-panel-next', { selected: this.selected });
        }
    },
    
    /**
     * Go to last real page, de-increment the step number.
     */
    previous: function() {
        if (this.useDynamicAnimation) {
            this.entryanimation = "slide-from-left-animation";
        }
        this.selected = this.getLastReal();
        this.step--;
        this.fire('voyent-wizard-panel-previous', { selected: this.selected });
    },
    
    _getChildCount: function() {
        this.childcount = this.querySelector('#pages').childElementCount;
        return this.querySelector('#pages').childElementCount;
    },

    childCountChanged:function(){
        this.updateDisabled();
    },

    /**
     * Added to allow the wizard panel to work with interior conditional templates.
     * Returns -1 in the event that there are no more valid/displayed panels remaining, otherwise returns index.
     */
    getNextReal:function(){
        var nextToTry = this.selected + 1;
        while(true){
            var nextElement = this.querySelector('#pages').children[nextToTry];
            if((nextToTry >= this._getChildCount())||!nextElement){
                return -1;
            }
            else if(nextElement.style.display === 'none'){
                //else if(nextElement.offsetParent === null){
                nextToTry++;
            }
            else{
                return nextToTry;
            }
        }

    },

    getLastReal:function(){
        var nextToTry = this.selected - 1;
        while(true){
            var nextElement = this.querySelector('#pages').children[nextToTry];
            if((nextToTry < 0)||!nextElement){
                return -1;
            }
            else if(nextElement.style.display === 'none'){
                //else if(nextElement.offsetParent === null){
                nextToTry--;
            }
            else{
                return nextToTry;
            }
        }
    },
    
    onEnter: function() {
        if (!this.disableenterkey) {
            if (!this.nexthidden && !this.nextdisabled) {
                var nextButton = this.querySelector('#nextButton');
                if (nextButton) {
                    nextButton.click();
                }
            }
        }
    },
});
