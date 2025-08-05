var tape = require("tape");

var protobuf = require("..");

var def = {};

var proto = "package ns;\
enum Enm {\
    ONE = 1;\
    TWO = 2;\
}\
message Msg {\
    message Enm {}\
}\
service Svc {}";

tape.test("reflected namespaces", function(test) {

    var ns = protobuf.Namespace.fromJSON("ns", def);
    test.same(ns.toJSON(), def, "should construct from and convert back to JSON");

    var root = protobuf.parse(proto).root;
    ns = root.lookup("ns").resolveAll();
    test.same(ns.getEnum("Enm"), { ONE: 1, TWO: 2 }, "should get enums");

    test.throws(function() {
        ns.getEnum("Msg");
    }, Error, "should throw when getting a message as an enum");

    test.throws(function() {
        ns.getEnum("NOTFOUND");
    }, Error, "should throw when getting null as an enum");

    test.ok(ns.lookupType("Msg"), "should lookup types");

    test.equal(ns.get("Msg").lookupTypeOrEnum("Enm"), ns.lookup(".ns.Msg.Enm"), "should lookup the nearest type or enum");

    test.throws(function() {
        ns.lookupType("Enm");
    }, Error, "should throw when looking up an enum as a type");

    test.throws(function() {
        ns.lookupType("NOTFOUND");
    }, Error, "should throw when looking up null as a type");

    test.ok(ns.lookupEnum("Enm"), "should lookup enums");

    test.throws(function() {
        ns.lookupEnum("Msg");
    }, Error, "should throw when looking up a type as an enum");

    test.throws(function() {
        ns.lookupEnum("NOTFOUND");
    }, Error, "should throw when looking up null as an enum");

    test.ok(ns.lookupService("Svc"), "should lookup services");

    test.throws(function() {
        ns.lookupService("Msg");
    }, Error, "should throw when looking up a type as a service");

    test.throws(function() {
        ns.lookupService("NOTFOUND");
    }, Error, "should throw when looking up null as a service");

    test.equal(ns.lookup(""), ns, "should lookup itself for an empty path");

    test.equal(ns.lookup([]), ns, "should lookup itself for []");

    test.ok(ns.lookup(".") instanceof protobuf.Root, "should lookup root for .");

    test.ok(ns.lookup([""]) instanceof protobuf.Root, "should lookup root for [\"\"]");

    test.throws(function() {
        ns.define(null);
    }, "should throw when path is not a string or array");

    test.throws(function() {
        ns.define(".sub", {});
    }, "should throw when defining absolute .sub");

    test.throws(function() {
        ns.define(["", "sub"], {});
    }, "should throw when defining absolute [\"\", \"sub\"]");

    var sub = ns.define("sub", {});
    test.equal(ns.lookup("sub"), sub, "should define sub namespaces");

    test.throws(function() {
        ns.add(new protobuf.ReflectionObject("invalid"));
    }, TypeError, "should throw when adding invalid nested objects");

    test.throws(function() {
        ns.add(new protobuf.Enum("sub"));
    }, Error, "should throw on duplicate names");

    sub = ns.define("sub.sub");
    test.equal(ns.lookup("sub.sub"), sub, "should define sub sub namespaces");

    test.throws(function() {
        ns.remove(true);
    }, TypeError, "should throw when trying to remove non-reflection objects");

    test.throws(function() {
        ns.remove(new protobuf.Enum("Enm"));
    }, Error, "should throw when trying to remove non-children");

    test.throws(function() {
        ns.add(new protobuf.Enum("MyEnum", {}));
        ns.define("MyEnum");
    }, Error, "should throw when trying to define a path conflicting with non-namespace objects");

    ns = protobuf.Namespace.fromJSON("My", {
        nested: {
            Message: { fields: {} },
            Enum: { values: {} },
            Service: { methods: {} },
            extensionField: { type: "string", id: 1000, extend: "Message" },
            Other: { nested: {} }
        }
    });
    test.same(ns.toJSON(), {
        nested: {
            Message: { fields: {} },
            Enum: { values: {} },
            Service: { methods: {} },
            extensionField: { extend: "Message", id: 1000, type: "string" },
            Other: { }
        }
    }, "should create from Type, Enum, Service, extension Field and Namespace JSON");

    root = new protobuf.Root();

    root.addJSON({
        outer: {
            nested: {
                inner: {
                    nested: {
                        Message: {
                            fields: {
                                amount: { type: "int32", id: 2 },
                                code: { type: "string", id: 3 }
                            }
                        },
                        Service: {
                            methods: {
                                MakeUpdate: {
                                    requestType: "ExampleRequest",
                                    responseType: "ExampleResponse"
                                }
                            }
                        },
                    }
                },
                OuterMessage: { fields: {} }
            }
        }
    });

    // store these before calling `addJSON` the second time
    var originalOuter = root.lookup('outer');
    var originalInner = originalOuter.lookup('inner');
    var originalMessage = originalInner.lookup('Message');
    var originalService = originalInner.lookup('Service');
    var originalOuterMessage = originalOuter.lookup('OuterMessage');

    root.addJSON({
        outer: {
            nested: {
                inner: {
                    nested: {
                        MessageTwo: {
                            fields: {
                                amountTwo: { type: "int32", id: 5 },
                                codeTwo: { type: "string", id: 6 }
                            }
                        },
                        ServiceTwo: {
                            methods: {
                                MakeUpdateTwo: {
                                    requestType: "ExampleRequest",
                                    responseType: "ExampleResponse"
                                }
                            }
                        },
                    }
                },
                OuterMessageTwo: { fields: {} }
            }
        }
    });

    test.same(root.toJSON().nested.outer, {
        nested: {
            inner: {
                nested: {
                    Message: {
                        fields: {
                            amount: { type: "int32", id: 2 },
                            code: { type: "string", id: 3 }
                        }
                    },
                    Service: {
                        methods: {
                            MakeUpdate: {
                                requestType: "ExampleRequest",
                                responseType: "ExampleResponse"
                            }
                        }
                    },
                    MessageTwo: {
                        fields: {
                            amountTwo: { type: "int32", id: 5 },
                            codeTwo: { type: "string", id: 6 }
                        }
                    },
                    ServiceTwo: {
                        methods: {
                            MakeUpdateTwo: {
                                requestType: "ExampleRequest",
                                responseType: "ExampleResponse"
                            }
                        }
                    }
                }
            },
            OuterMessage: { fields: {} },
            OuterMessageTwo: { fields: {} }
        },
    }, "should merge deeply nested namespaces");

    // These leaf objects should not be changed by the above merge as they do not conflict
    test.equal(originalMessage, root.lookup("outer.inner.Message"), "inner.Message not be changed by merge");
    test.equal(originalService, root.lookup("outer.inner.Service"), "inner.Service not be changed by merge");
    test.equal(originalOuterMessage, root.lookup("outer.OuterMessage"), "OuterMessage not be changed by merge");

    // Note: these assertions cover an implementation detail. Right now, the Namespace.add recursion
    // alternates between the original Namespace and the new Namespace at each level of merging.
    // In our case, the original `outer` is replaced by the new `outer`, but the `inner` namespace remains the same.
    test.notEqual(originalOuter, root.lookup("outer"), "outer should be changed after merging");
    test.equal(originalInner, root.lookup("outer.inner"), "inner should not be changed after merging");

    test.equal(originalOuter.parent, null, "removed outer namespace should not have a parent");
    test.equal(originalInner.parent, root.lookup("outer"), "unremoved inner namespace's parent is the current outer namespace");

    test.equal(originalOuter.lookup("inner"), null, "removed outer should not be able to look up an inner namespace");
    test.equal(originalOuter.lookup("OuterMessage"), null, "removed outer should not be able to look up an OuterMessage");

    test.end();
});
