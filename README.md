cyclon.p2p-rtc-comms
====================

[![Build Status](https://travis-ci.org/nicktindall/cyclon.p2p-rtc-comms.svg?branch=master)](https://travis-ci.org/nicktindall/cyclon.p2p-rtc-comms)
[![Dependencies](https://david-dm.org/nicktindall/cyclon.p2p-rtc-comms.png)](https://david-dm.org/nicktindall/cyclon.p2p-rtc-comms)

A WebRTC implementation of the [cyclon.p2p](https://github.com/nicktindall/cyclon.p2p) `Comms` and `Bootstrap` interfaces.

This project implements the cyclon.p2p `Comms` and `Bootstrap` interfaces using [cyclon.p2p-rtc-client](https://github.com/nicktindall/cyclon.p2p-rtc-client). For more information about the `Comms` and `Bootstrap` interfaces, see [cyclon.p2p](https://github.com/nicktindall/cyclon.p2p).

How to use
----------
First install `cyclon.p2p-rtc-comms` and `cyclon.p2p` as runtime dependencies using npm

```
npm install cyclon.p2p-rtc-comms --save
npm install cyclon.p2p --save
```

Create a Comms and Bootstrap instance using the builder provided, e.g.

```javascript
const {commsAndBootstrapBuilder} = require('cyclon.p2p-rtc-comms');
const {builder} = require('cyclon.p2p');

const { comms, bootstrap } = commsAndBootstrapBuilder().build();
const cyclonNode = builder(comms, bootstrap).build();
cyclonNode.start();
```