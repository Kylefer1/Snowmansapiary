(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MeadowProgression=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const KEY='snowmans-meadow-2-progression';
const UPGRADES={
 health:{name:'Hardy Defender',max:5,costs:[35,65,110,180,280],description:rank=>`Start each run with ${rank*20} extra maximum health.`,art:'jelly',shared:true},
 reach:{name:'Gathering Instinct',max:3,costs:[25,60,110],description:rank=>`Start with ${rank*10}% more pickup reach.`,art:'pickup',shared:true},
 focus:{name:'Steady Focus',max:3,costs:[45,90,160],description:rank=>`Charge your stationary special in ${(6-rank*.5).toFixed(1)} seconds.`,art:'orbit',shared:true},
 guard:{name:'Royal Guard Training',character:'queen',max:3,costs:[45,100,200],description:rank=>`Start with Guard Bees at rank ${Math.min(5,2+rank)} of 5.`,art:'guard'},
 sting:{name:'Royal Sting',character:'queen',max:5,costs:[900,1800,3600,7200,14400],description:rank=>`Guard Bees deal ${rank*35}% more damage, including Royal Guard and Royal Tempest.`,art:'guard'},
 command:{name:'Royal Command',character:'queen',max:1,costs:[120],description:()=> 'Every 12 seconds, mark a nearby enemy for four seconds. All attacks deal 20% more damage to it.',art:'royal'},
 reserves:{name:'Royal Resilience',character:'queen',max:3,costs:[40,85,150],description:rank=>`When badly hurt, gain ${rank*2} seconds of protection. Can trigger once every 45 seconds.`,art:'shield'},
 explosive:{name:'Explosive Snowballs',character:'snowman',max:4,costs:[40,100,220,900],names:['Plain Snowballs','Firecracker Snowballs','Heavy Firecracker','Dynamite Snowballs','Overkill'],description:rank=>['','25% more damage, a small blast, and 12% longer between volleys.','65% more damage, a wider blast, double armor damage, and 30% longer between volleys.','130% more damage, a large blast, double armor damage, and 55% longer between volleys.','280% more damage, an enormous blast, double armor damage, and 110% longer between volleys.'][rank],art:'firecracker'},
 spear:{name:'Snow Shot',character:'snowman',max:3,costs:[55,130,260],description:rank=>`Add an icicle spear: ${75+rank*45} damage, pierces ${3+rank*2} enemies, fires every ${(3.8-rank*.25).toFixed(2)} seconds.`,art:'snowshot'}
};
const integer=(v,max=100000000)=>Number.isFinite(v)?Math.max(0,Math.min(max,Math.floor(v))):0;
function clean(raw){raw=raw&&typeof raw==='object'?raw:{};const result={beeswax:integer(raw.beeswax),earned:integer(raw.earned),upgrades:{},equipped:integer(raw.equipped,4),run:raw.run&&typeof raw.run==='object'?{id:String(raw.run.id||'').slice(0,80),credited:integer(raw.run.credited)}:null};for(const [id,def]of Object.entries(UPGRADES))result.upgrades[id]=integer(raw.upgrades?.[id],def.max);result.equipped=Math.min(result.equipped,result.upgrades.explosive);return result;}
function earned(game){const base=Math.floor(Math.max(0,game.time)/20)+Math.floor(Math.max(0,game.kills)/15)+Math.floor(Math.max(0,game.wave-1)/5)*3;if(game.stage===4||game.stage===5)return base*(game.stage===5?3:2)+Math.max(0,Math.floor(game.challengeBossKills||0))*(game.stage===5?3:2)+(game.campaignComplete?(game.stage===5?300:180):0);return game.stage===3?base*2+Math.max(0,Math.floor(game.arenaBossKills||0))*3+(game.campaignComplete?100:0):base;}
class Store{
 constructor(storage){this.storage=storage;this.persisted=true;let raw;try{raw=JSON.parse(storage?.getItem(KEY)||'null');}catch(_){}this.data=clean(raw);}
 save(){try{if(!this.storage)throw Error('unavailable');this.storage.setItem(KEY,JSON.stringify(this.data));this.persisted=true;}catch(_){this.persisted=false;}return this.persisted;}
 begin(id){this.data.run={id,credited:0};this.save();}
 credit(game){if(!this.data.run)return 0;const total=earned(game),amount=Math.max(0,total-this.data.run.credited);if(amount){this.data.beeswax=integer(this.data.beeswax+amount);this.data.earned=integer(this.data.earned+amount);this.data.run.credited=total;this.save();}return amount;}
 buy(id,character){const def=UPGRADES[id];if(!def||def.character&&def.character!==character)return false;const rank=this.data.upgrades[id];if(rank>=def.max||this.data.beeswax<def.costs[rank])return false;this.data.beeswax-=def.costs[rank];this.data.upgrades[id]++;if(id==='explosive')this.data.equipped=this.data.upgrades[id];this.save();return true;}
 equip(rank){rank=integer(rank,4);if(rank>this.data.upgrades.explosive)return false;this.data.equipped=rank;this.save();return true;}
 build(character){const u=this.data.upgrades;return {health:u.health,reach:u.reach,focus:u.focus,guard:character==='queen'?u.guard:0,sting:character==='queen'?u.sting:0,command:character==='queen'?u.command:0,reserves:character==='queen'?u.reserves:0,explosive:character==='snowman'?this.data.equipped:0,spear:character==='snowman'?u.spear:0};}
}
return {KEY,UPGRADES,Store,clean,earned};
});
