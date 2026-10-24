import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, displayPercent, numberOrNull, timestamp, measurementTime, activePlus, normalHistory, deviceModel, historyForDevice, filterDevices, validPathKey, airState } from '../core.js';
const now=1792864800000;
test('missing sensor values never become a real zero-percent measurement',()=>{
 for(const missing of [null,undefined,'',' ',false,true,{},[],'NaN',Infinity]) {assert.equal(numberOrNull(missing),null);assert.equal(displayPercent(missing,CATEGORIES[2].key),null);}
 assert.equal(displayPercent(0,CATEGORIES[2].key),0);
 assert.equal(displayPercent(-1,CATEGORIES[2].key),null);
 assert.equal(displayPercent(102,CATEGORIES[2].key),null);
});
test('every existing category retains the old conversion and 35 percent alert boundary',()=>{
 for(const c of CATEGORIES){assert.equal(displayPercent(c.min,c.key),0);assert.equal(displayPercent(c.max,c.key),100);assert.equal(displayPercent((c.min+c.max)/2,c.key),50);}
 const low=deviceModel('u','mail','dev',{sensorValue:40,plantType:CATEGORIES[2].key,lastMeasurementAt:now},{},now);
 assert.equal(low.percent,33);assert.equal(low.tone,'dry');
 const above=deviceModel('u','mail','dev',{sensorValue:41,plantType:CATEGORIES[2].key,lastMeasurementAt:now},{},now);
 assert.equal(above.percent,37);assert.equal(above.tone,'good');
 const wet=deviceModel('u','mail','dev',{sensorValue:90,lastMeasurementAt:now},{},now);assert.equal(wet.tone,'wet');assert.equal(wet.percent,100);
});
test('heartbeats and setting changes cannot make an old measurement look new',()=>{
 const old=now-15*3600000;
 assert.equal(measurementTime({lastMeasurementAt:old,lastSeen:now,updatedAt:now}),old);
 assert.equal(measurementTime({lastSeen:now,updatedAt:now}),0);
 const stale=deviceModel('u','mail','dev',{sensorValue:50,lastMeasurementAt:old,lastSeen:now},{},now);assert.equal(stale.tone,'stale');
 const unknown=deviceModel('u','mail','dev',{sensorValue:50,lastSeen:now},{},now);assert.equal(unknown.tone,'unknown');
 const future=deviceModel('u','mail','dev',{sensorValue:50,lastMeasurementAt:now+3600000},{},now);assert.equal(future.future,true);assert.equal(future.tone,'unknown');
});
test('millisecond, Unix-second and ISO times normalize consistently',()=>{
 assert.equal(timestamp(now/1000),now);assert.equal(timestamp(now),now);assert.equal(timestamp(new Date(now).toISOString()),now);assert.equal(timestamp(null),0);assert.equal(timestamp('bad'),0);
});
test('Plus requires a recognized state and respects expiry and cancellation',()=>{
 assert.equal(activePlus({plan:'plus',status:'active',expiresAt:now+1000},now),true);
 assert.equal(activePlus({plan:'plus',status:'active',expiresAt:(now-1000)/1000},now),false);
 assert.equal(activePlus({plan:'plus',status:'canceled',cancelAtPeriodEnd:true,expiresAt:now+1000},now),true);
 assert.equal(activePlus({plan:'plus',status:'canceled',cancelAtPeriodEnd:true},now),false);
 for(const status of ['','inactive','unpaid','paused','mystery','expired'])assert.equal(activePlus({plan:'plus',status},now),false);
 assert.equal(activePlus({plan:'free',status:'active'},now),false);
});
test('history keeps real flat periods, sorts, deduplicates timestamps and rejects invalid data',()=>{
 const points=normalHistory([{t:now,v:20},{t:now-1000,v:20},{t:now,v:22},{t:now+1,v:null},{t:now+2,v:101}]);
 assert.deepEqual(points,[{t:now-1000,v:20},{t:now,v:22}]);
 const object=normalHistory({[now]:50,[now-1000]:{v:35},bad:12});assert.equal(object.length,2);assert.equal(object[0].v,35);
});
test('current chart point uses the actual measurement time; Free does not erase stored history',()=>{
 const data={sensorValue:45,lastMeasurementAt:now,history:{[now-1000]:40}};
 const free=deviceModel('u','mail','dev',data,{},now);assert.equal(free.history.length,1);assert.deepEqual(historyForDevice(free),[{t:now,v:50}]);
 const plus=deviceModel('u','mail','dev',data,{plan:'plus',status:'active'},now);assert.equal(historyForDevice(plus).length,2);
 assert.deepEqual(data.history,{[now-1000]:40});
});
test('air, battery and stale data all contribute to attention filters',()=>{
 const base={sensorValue:50,lastMeasurementAt:now};
 const healthy=deviceModel('u','mail','good',{...base,displayName:'Zöldike'},{},now);
 const air=deviceModel('u','mail','air',{...base,airQuality:{aqi:4,tvoc:600,eco2:900}},{},now);
 const battery=deviceModel('u','mail','battery',{...base,batteryPercent:10},{},now);
 assert.equal(filterDevices([healthy,air,battery],'attention').length,2);assert.equal(filterDevices([healthy,air,battery],'good').length,1);
 assert.equal(filterDevices([healthy],'all','zÖLD').length,1);
});
test('device ids cannot escape their database path',()=>{
 for(const bad of ['','a/b','a.b','a#b','a$b','a[b','a\u0000b'])assert.equal(validPathKey(bad),false);
 assert.equal(validPathKey('esp32_004'),true);
});

test('missing air ratings and invalid battery values are not shown as healthy or full',()=>{
 assert.equal(airState({tvoc:100,eco2:500}).label,'Nincs minősítés');
 assert.equal(airState({aqi:0,tvoc:100}).aqi,null);
 const model=deviceModel('u','mail','dev',{sensorValue:50,lastMeasurementAt:now,batteryPercent:999},{},now);
 assert.equal(model.battery,null);
});
