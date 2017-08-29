Polymer({
    is: 'voyent-toggle-panel',

    properties: {
        animations: {
            type: String,
            value: "true"
        },
        visible: {
            type: Boolean,
            value: false
        },
        expanded: {
            type: Boolean,
            value: false
        },
        header: {
            type: String
        },
    },
    
    attached: function() {
        var _this = this;
        setTimeout(function() {
            _this.visible = true;
        },200);
    },
    
    toggle: function(e) {
        this.set('expanded', !this.expanded);
    },
});
