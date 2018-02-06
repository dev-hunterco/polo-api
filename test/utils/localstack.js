/***
 * Gerenciador do Localstack para testes
 */
const logger = require('winston')
const spawn = require('child_process').spawn;
const AWS = require('aws-sdk')

// Preinicializa a api da AWS
AWS.config.update({
    "accessKeyId": "foobar",
    "secretAccessKey": "foobar",
    "region": "us-east-1"
});

var instance = null;
var services2start = null;
var isInstanceRunning = false;

function start(opts) {
    return new Promise((resolve, reject) => {
        logger.info("Iniciando o Localstack...");
        instance = spawn('localstack', ['start'], opts);

        // Aguarda pela linha "Ready."
        instance.stdout.on('data', (data) => {
            data.toString().split('\n').filter(l => l.length > 0).forEach(line => {
                logger.info(`stdout: ${line}`);
                if(line === 'Ready.') {
                    logger.info("Localstack is ready !");
                    isInstanceRunning = true;
                    resolve()
                }
            })
        });

        // Saidas na stream de erro
        instance.stderr.on('data', (data) => {
            // data.toString().split('\n').forEach(l => logger.warn(l))
        });
        instance.on('close', (code) => {
            isInstanceRunning = false;
            logger.error(`Localstack has being terminated with code: ${code}`);
        });

        // Quantos os testes acabarem, termina o processo também.
        process.on('beforeExit',function(code){
            stop().then(_ => isInstanceRunning = false);
        })            
    });
}

function stop() {
    return new Promise((resolve, reject) => {
        logger.info("Finalizando Localstack...");

        instance.kill('SIGINT');     
        instance.on('close', function(){
            isInstanceRunning = false;
            resolve();
        })       
    });
}

function isRunning() {
    return isInstanceRunning;
}


/*********
 * SQS Functions....
 */
function purgeSQS() {
    var conf = {
        endpoint:"http://localhost:4576"
    }
    var sqsAPI = new AWS.SQS(conf);

    return new Promise((resolve, reject) => {
        sqsAPI.listQueues({}, function(err, data) {
            if(err) {
                reject(err);
                return;
            }
            if(!data || !data.QueueUrls) {
                resolve();
                return;
            }

            resolve(Promise.all(data.QueueUrls.map(u => {
                    return {
                        QueueUrl: u
                    }
                })
                .map(p => new Promise((res, rej) => {
                    sqsAPI.purgeQueue(p, function(err2, data2) {
                        logger.debug("Queue purged...", p.QueueUrl, err);
                        if (err2) rej(err2);
                        else res();
                      });
                }))
            ));
        });
    });
}

module.exports = {start, stop, isRunning, purgeSQS};
            
