Polymer({
	is: "voyent-form-field",

    properties: {
        value: { type: Object, reflectToAttribute: true, notify: true },
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
