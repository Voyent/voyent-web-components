Polymer({
    is: 'voyent-toggle-panel',

    properties: {
        visible: {
            type: Boolean,
            value: false
        },
        animations: {
            type: String,
            value: "true",
            reflectToAttribute: true,
            notify: true
        },
        toggleable: {
            type: String,
            value: "true",
            reflectToAttribute: true,
            notify: true
        },
        expanded: {
            type: Boolean,
            value: false,
            reflectToAttribute: true,
            notify: true
        },
        header: {
            type: String,
            reflectToAttribute: true,
            notify: true
        },
    },
    
    attached: function() {
        var _this = this;
        setTimeout(function() {
            _this.visible = true;
        },200);
    },
    
    toggle: function(e) {
        if (this.toggleable && "true" === this.toggleable) {
            this.set('expanded', !this.expanded);
        }
    },
});
