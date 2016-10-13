var poly;
Polymer({

    is: "voyent-chart-inputs",

    properties: {
        independentOptions:Object,
        dependentOptions:Object,
        service:{
            type: String,
            notify: true,
            observer: '_updateVariables'
        },
        configure:String
    },

    created: function () {
        poly = this;
        this.independentOptions = [];
        this.independentOptions["string"] = [];
        this.independentOptions["time"] = [];
        this.independentOptions["number"] = [];
        this.independentOptions["string"]["common"]=["event","type","username","data.origin"];
        this.independentOptions["string"]["storage"]=["data.mimetype","data.originalName"];
        this.independentOptions["string"]["locate"]=[];
        this.independentOptions["string"]["event"]=[];
        this.independentOptions["time"]["common"]=["time"];
        this.independentOptions["time"]["storage"]=[];
        this.independentOptions["time"]["locate"]=[];
        this.independentOptions["time"]["event"]=[];
        this.independentOptions["number"]["common"]=["data.processTime"];
        this.independentOptions["number"]["storage"]=[];
        this.independentOptions["number"]["locate"]=[];
        this.independentOptions["number"]["event"]=[];
        this.dependentOptions = [];
        this.dependentOptions["common"]=["data.processTime"];
        this.dependentOptions["storage"]=["data.size"];
        this.dependentOptions["locate"]=[];
        this.dependentOptions["event"]=[];
    },

    ready: function () {
        this._updateVariables();
        //this.$$("#service").onchange = "";
        var startPicker = new Pikaday({field: document.getElementById("startRange")});
        var endPicker = new Pikaday({field: document.getElementById("endRange")});
    },

    //******************PRIVATE API******************
    _updateVariables: function () {
        var dependentElement = this.$$("#dependent");
        var independentElement = this.$$("#independent");
        var service = this.$$("#service").value;
        dependentElement.innerHTML = "";
        independentElement.innerHTML = "";
        var validTypes = this.configure.split(",");
        for (var varType in validTypes) {
            for (var element in this.independentOptions[validTypes[varType]]["common"]) {
                var newOption = document.createElement("option");
                newOption.innerHTML = this.capitalize(this.independentOptions[validTypes[varType]]["common"][element]);
                newOption.value = this.independentOptions[validTypes[varType]]["common"][element];
                if (independentElement.innerHTML == "")
                    newOption.setAttribute("selected", "selected");
                independentElement.appendChild(newOption);
            }
            for (var element in this.independentOptions[validTypes[varType]][service]) {
                var newOption = document.createElement("option");
                newOption.innerHTML = this.capitalize(this.independentOptions[validTypes[varType]][service][element]);
                newOption.value = this.independentOptions[validTypes[varType]][service][element];
                independentElement.appendChild(newOption);
            }
        }
        for (var element in this.dependentOptions["common"]) {
            var newOption = document.createElement("option");
            newOption.innerHTML = this.capitalize(this.dependentOptions["common"][element]);
            newOption.value = this.dependentOptions["common"][element];
            if (dependentElement.innerHTML == "")
                newOption.setAttribute("selected", "selected");
            dependentElement.appendChild(newOption);
        }
        for (var element in this.dependentOptions[service]) {
            var newOption = document.createElement("option");
            newOption.innerHTML = this.capitalize(this.dependentOptions[service][element]);
            newOption.value = this.dependentOptions[service][element];
            dependentElement.appendChild(newOption);
        }
        var selector = document.getElementById("independent");
        if(selector[selector.selectedIndex].value == 'time') document.getElementById('timeVars').style.display=''; else document.getElementById('timeVars').style.display='none';
    },

    capitalize: function(s){
            return s.charAt(0).toUpperCase() + s.slice(1);
    }

});