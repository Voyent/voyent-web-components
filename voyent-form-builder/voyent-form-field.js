Polymer({
	is: "voyent-form-field",

    properties: {
        value: { type: Object, reflectToAttribute: true, notify: true },
    },
    
    /**
     * Define our initial tool data structure for backing our UI controls
     */
	ready: function() {
	},
	
    isEqual: function(a, b) {
        // Technically a null/null or undefined/undefined value match, so check for those
        if ((a == null && b == null) || (typeof a === "undefined" && typeof b === "undefined")) {
            return true;
        }
        
        // Otherwise just compare
        return a === b;
    },
});
