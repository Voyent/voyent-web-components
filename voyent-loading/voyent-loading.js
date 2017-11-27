Polymer({
    is: "voyent-loading",

    properties: {
        on: { type: Boolean, value: false, notify: true, reflectToAttribute: true },
        locked: { type: Boolean, value: false, notify: true, reflectToAttribute: true }
    },
    
    ready: function() {
        if (!this.locked) {
            var _this = this;
            window.addEventListener('loading-on',  function(e) {
                _this.on = true;
            });
            
            window.addEventListener('loading-off',  function(e) {
                _this.on = false;
            });
        }
    },
});
