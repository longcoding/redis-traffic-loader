const
    uuid = require('uuid/v1');
    Redis = require('ioredis');
    readYml = require('read-yaml');
    fs = require('fs');
    config = readYml.sync('./src/config.yml');
    cluster = new Redis({
        port: config.redis.port,
        host: config.redis.host,
        db: config.redis.db
    });

async function executeTransactionPipeline(users) {
    let multi = cluster.multi({ pipeline: false });
    for (let user of users) multi.incr(`load::${user}`);
    multi.exec();
    for (let user of users) multi.del(`load::${user}`);
    return await multi.exec();
}

async function executePipeline(users) {
    let pipeline = cluster.pipeline();
    for (let user of users) pipeline.incr(`load::${user}`);
    pipeline.exec();
    for (let user of users) pipeline.del(`load::${user}`);
    return await pipeline.exec();
}

async function executeAlone(users) {
    for (let user of users) await cluster.incr(`load::${user}`);
    for (let user of users) await cluster.del(`load::${user}`);
}

async function createUsers(userCount) {
    let users = [];
    for (let i=0; i < userCount; i++) {
        users.push(uuid());
    }
    return users;
}

async function trafficLoader(tryCnt, userCount, executeFunc) {

    let array = Array.from(Array(tryCnt).keys());

    const startTime = (new Date).getTime();

    const promises = array.map(async _ => {
        await createUsers(userCount).then(async users => {
            return await executeFunc(users)
        })
    });

    await Promise.all(promises);

    const elapsedTime = (new Date).getTime() - startTime;
    const tps = (tryCnt/elapsedTime)*1000;
    const rps = ((tryCnt*userCount)/elapsedTime)*1000;
    const tat = elapsedTime/tryCnt;

    console.log("========================[ Report ]==================================\n");
    console.log(`Total Elapsed Time: ${elapsedTime} ms`);
    console.log(`TPS: ${tps}`);
    console.log(`RPS: ${rps}`);
    console.log(`1 Transaction Average Elapsed Time: ${tat} ms\n`);
    console.log("======================================================================");

    await fs.writeFileSync(`output/${process.env.pm_id}`, `${executeFunc.name},${elapsedTime},${tps},${rps},${tat}\n`);
}

async function contoller(tryCnt, userCount) {

    await trafficLoader(tryCnt, userCount, executeAlone);
    await trafficLoader(tryCnt, userCount, executePipeline);
    process.exit(0);

}

if (process.argv[2] == null || process.argv[3] == null) {
    console.log("Sorry for inconvenience.");
    process.exit(0);
}

contoller(process.argv[2], process.argv[3]);
