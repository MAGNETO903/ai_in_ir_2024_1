
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const jsCraft = require('mineflayer');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
const vm = require('vm');
const path = require('path');
const esprima = require('esprima');
const fs = require('fs');

const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements
const { GoalNear, GoalFollow } = require('mineflayer-pathfinder').goals
const mcDataModule = require('minecraft-data');
const move = require('mineflayer-move');


function extractAfterFirstBrace(input) {
  const index = input.indexOf('{"program"'); // Находим индекс первой '{'
  if (index === -1) {
    return ''; // Если '{' не найдено, возвращаем пустую строку
  }
  return input.slice(index + 10); // Возвращаем часть строки после '{'
}


function extractJavaScriptCode(input) {
  // Регулярное выражение для поиска кода
  const regex = /```[\w\s]*\n([\s\S]*?)```/g;
  const matches = [];
  let match;

  while ((match = regex.exec(input)) !== null) {
    matches.push(match[1].trim()); // Добавляем содержимое блока без обрамляющих кавычек
  }

  // Если нет обрамляющих кавычек, возвращаем весь текст
  if (matches.length === 0) {
    return [input.trim().replace(/```/g, "")];
  }

  // Удаляем тройные кавычки из всех извлечённых блоков
  return matches.map(code => code.replace(/```/g, ""));
}




function addIntervalTimeoutPolyfills(jsCode) {
  const setTimeoutPolyfill = `
function setTimeout(callback, delay, ...args) {
  const start = Date.now();
  function check() {
    if (Date.now() - start >= delay) {
      callback(...args);
    } else {
      setImmediate(check); // Use setImmediate to check in the next cycle
    }
  }
  setImmediate(check);
}
`;

  const setIntervalPolyfill = `
const activeIntervals = new Set();

function setInterval(callback, interval, ...args) {
  const id = Symbol('interval'); // Unique ID for this interval
  let stopped = false;

  function execute() {
    if (stopped) return;

    const start = Date.now();
    callback(...args);

    const elapsed = Date.now() - start;
    const delay = Math.max(0, interval - elapsed);

    setTimeout(() => execute(), delay); // Use polyfilled setTimeout
  }

  activeIntervals.add(id); // Track the interval
  execute();

  return id; // Return unique ID
}

function clearInterval(id) {
  if (activeIntervals.has(id)) {
    activeIntervals.delete(id); // Remove from tracked intervals
  } else {
    //console.warn(\`Interval ID  not found.\`);
  }
}
`;

  // Check if setTimeout, setInterval, or clearInterval already exists in the code
  if (!jsCode.includes('function setTimeout(')) {
    jsCode = setTimeoutPolyfill + '\n' + jsCode;
  }
  if (!jsCode.includes('function setInterval(')) {
    jsCode = setIntervalPolyfill + '\n' + jsCode;
  }
  if (!jsCode.includes('function clearInterval(')) {
    jsCode = setIntervalPolyfill + '\n' + jsCode; // clearInterval is part of the same polyfill
  }

  return jsCode;
}


function appendFileContentToStringSync(filePath, baseString) {
    try {
        // Read the file contents synchronously
        const fileContent = fs.readFileSync(filePath, 'utf8');

        // Append the file contents to the base string
        return fileContent+baseString;
    } catch (err) {
        console.error(`Error reading the file: ${err.message}`);
        throw err;
    }
}


var Vec3 = require('vec3')

console.log("Инициализация...");

// Парсинг аргументов командной строки и переменной окружения для порта Minecraft-сервера
const args = process.argv.slice(2); // Получаем аргументы после "node" и скрипта
let minecraftPort = 51039; // Значение по умолчанию

// Проверка, передан ли порт как аргумент командной строки
if (args.length > 0) {
  const portArg = parseInt(args[0], 10);
  if (!isNaN(portArg) && portArg > 0 && portArg < 65536) {
    minecraftPort = portArg;
    console.log(`Minecraft-серверный порт установлен на: ${minecraftPort} (из аргумента командной строки)`);
  } else {
    console.warn(`Некорректный порт "${args[0]}". Пытаемся взять порт из переменной окружения.`);
    // Попытка взять порт из переменной окружения
    if (process.env.MINECRAFT_PORT) {
      const envPort = parseInt(process.env.MINECRAFT_PORT, 10);
      if (!isNaN(envPort) && envPort > 0 && envPort < 65536) {
        minecraftPort = envPort;
        console.log(`Minecraft-серверный порт установлен на: ${minecraftPort} (из переменной окружения)`);
      } else {
        console.warn(`Некорректный порт в переменной окружения MINECRAFT_PORT="${process.env.MINECRAFT_PORT}". Используется порт по умолчанию: ${minecraftPort}`);
      }
    } else {
      console.log(`Переменная окружения MINECRAFT_PORT не установлена. Используется порт по умолчанию: ${minecraftPort}`);
    }
  }
} else {
  // Если аргумент командной строки не передан, берем порт из переменной окружения
  if (process.env.MINECRAFT_PORT) {
    const envPort = parseInt(process.env.MINECRAFT_PORT, 10);
    if (!isNaN(envPort) && envPort > 0 && envPort < 65536) {
      minecraftPort = envPort;
      console.log(`Minecraft-серверный порт установлен на: ${minecraftPort} (из переменной окружения)`);
    } else {
      console.warn(`Некорректный порт в переменной окружения MINECRAFT_PORT="${process.env.MINECRAFT_PORT}". Используется порт по умолчанию: ${minecraftPort}`);
    }
  } else {
    console.log(`Порт Minecraft-сервера не передан. Используется порт по умолчанию: ${minecraftPort}`);
  }
}


// Переменные для бота и истории
let bot;
let history = [];



// Функция для описания текущей обстановки
async function describeEnvironment(bot, currentTask = 'No task assigned', context = 'No additional context') {
  try {
    // Получаем позицию бота
    const position = bot.entity.position;
    const positionDescription = `Position: x=${Math.floor(position.x)}, y=${Math.floor(position.y)}, z=${Math.floor(position.z)}`;

    // Определяем биом
    const biome = bot.registry.biomes[bot.world.getBiome(position).value]?.name || 'Unknown biome';
    const biomeDescription = `Biome: ${biome}`;

    // Получаем текущее время в игровом мире
    const timeOfDay = bot.time.timeOfDay;
    const timeDescription = `Time: ${timeOfDay >= 12000 ? 'Night' : 'Day'}`;

    // Получаем ближайшие блоки
    const blocks = [];
    for (let x = -5; x <= 5; x++) {
      for (let y = -5; y <= 5; y++) {
        for (let z = -5; z <= 5; z++) {
          const block = bot.blockAt(position.offset(x, y, z));
          if (block && !blocks.includes(block.name)) {
            blocks.push(block.name);
          }
        }
      }
    }
    const blocksDescription = `Nearby blocks: ${blocks.join(', ') || 'None'}`;

    // Получаем ближайшие сущности
    const entities = Object.values(bot.entities)
      .filter(entity => entity !== bot.entity)
      .map(entity => `${entity.name || 'unknown'} (${Math.floor(entity.position.distanceTo(position))}m)`)
      .sort((a, b) => parseFloat(a.split('(')[1]) - parseFloat(b.split('(')[1]));
    const entitiesDescription = entities.length > 0
      ? `Nearby entities (nearest to farthest): ${entities.join(', ')}`
      : 'Nearby entities (nearest to farthest): None';

    // Состояние здоровья и голода
    const healthDescription = `Health: ${bot.health}/20`;
    const hungerDescription = `Hunger: ${bot.food}/20`;

    // Инвентарь
    const inventory = bot.inventory.items();
    const inventoryDescription = `Inventory (${inventory.length}/36): ${inventory.map(item => `${item.count}x ${item.displayName}`).join(', ') || 'Empty'}`;

    // Снаряжение
    const equipment = [
  'head', // Helmet
  'torso', // Chestplate
  'legs', // Leggings
  'feet', // Boots
  'hand', // Main hand
  'off-hand' // Off-hand
]  .map(slot => bot.inventory.slots[bot.getEquipmentDestSlot(slot)]?.displayName || 'None');
    const equipmentDescription = `Equipment: ${equipment.join(', ')}`;

    // Получаем информацию о сундуках
    const chestsDescription = 'Chests: No chests tracked yet'; // Здесь можно добавить логику, если сундуки хранятся отдельно.

    // Задача и контекст
    const taskDescription = `Task: ${currentTask}`;
    const contextDescription = `Context: ${context}`;

    // Формируем финальное описание
    const description = [
      positionDescription,
      biomeDescription,
      timeDescription,
      blocksDescription,
      entitiesDescription,
      healthDescription,
      hungerDescription,
      inventoryDescription,
      equipmentDescription,
      chestsDescription,
      taskDescription,
      contextDescription,
    ].join('\n');

    return description;
  } catch (error) {
    console.error('Error describing environment:', error);
    return 'Unable to describe the environment due to an error.';
  }
}



// Добавьте в начале файла
const axios = require('axios');

// Функция для генерации программы для бота
async function generateBotProgram(description, instruction) {
  console.log('Отправка запроса к LLM серверу через HTTP...');

  try {
    const response = await axios.post('http://localhost:8000/generate', {
      instruction,
      description
    });

    const result = response.data;

    if (result.error) {
      console.error('Ошибка при генерации программы:', result.error);
      throw new Error(result.error);
    } else {
      console.log('Получен сгенерированный код от LLM:');
      console.log(result.program);
      return result.program;
    }
  } catch (error) {
    console.error('Ошибка при общении с LLM сервером:', error);
    throw error;
  }
}


// Функция для загрузки и выполнения программы в боте
function loadBotProgram(bot, programCode) {
  //console.log("Сгенерированный код программы:");
  //console.log(programCode); // Логирование кода

  try {
    // Путь к файлу и строка
var filePath = 'useful_functions.txt';

// Чтение содержимого файла и добавление перед строкой
   programCode = fs.readFileSync(filePath, 'utf8') + programCode;

  //
   console.log(programCode) 
    esprima.parseScript(programCode);
    const script = new vm.Script(programCode);
    const sandbox = { bot, console, setImmediate, require, Vec3, Movements, GoalFollow, GoalNear, mcDataModule };
    script.runInNewContext(sandbox);
    console.log('Программа для бота успешно загружена и выполнена.');
  } catch (error) {
    console.error('Ошибка при загрузке программы для бота:', error);
  }
}

// Функция для запуска бота и визуализации
async function startBot() {
  bot = jsCraft.createBot({
    host: 'localhost',
    port: minecraftPort, // Порт вашего Minecraft сервера
    username: 'bot'
  });

  // Install move and pathfinder
  

  bot.once('spawn', async () => {
    console.log('Бот появился в мире.');
    pathfinder(bot);
    move(bot);
    mineflayerViewer(bot, { port: 3001, firstPerson: true });

    // Открытие окна визуализации (верхнее левое)
    visualizationBrowser = await openBrowserWindow('http://localhost:3001', 800, 600, 0, 0);
    console.log('Окно визуализации открыто.');

    // Открытие диалогового окна (нижнее левое)
     //console.log('Диалоговое окно открыто.');
  });

  bot.on('login', () => {
    console.log('Бот успешно подключился к серверу!');
  });

  // Обновлённый обработчик событий чата
  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    //console.log(`${username}: ${message}`);

    const prefix = '!bot ';
    if (message.startsWith(prefix)) {
      const instruction = message.substring(prefix.length).trim();
      console.log(`Получена инструкция от ${username}: ${instruction}`);

      // Шаг 1: Получить описание текущей обстановки
      const description = await describeEnvironment(bot);

      // Шаг 2: Сгенерировать программу для бота
      try {
        var programCode = await generateBotProgram(description, instruction);
        //console.log("programCode:", programCode)

        if (programCode) {

          // Выполнить полученный код
          loadBotProgram(bot, addIntervalTimeoutPolyfills(extractJavaScriptCode(programCode)) + " botProgram(bot);");
          bot.chat(`Инструкция выполнена, ${username}!`);
        } else {
          bot.chat(`Не удалось выполнить инструкцию, ${username}.`);
        }
      } catch (error) {
        console.error('Ошибка при обработке инструкции:', error);
        bot.chat(`Произошла ошибка при выполнении инструкции, ${username}.`);
      }
    }
  });

  bot.on('end', () => {
    console.log('Бот отключился от сервера.');
  });

  bot.on('error', (err) => {
    console.error('Ошибка:', err);
  });
}

// Функция для открытия окна браузера
async function openBrowserWindow(url, width, height, x, y) {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--window-size=${width},${height}`,
      `--window-position=${x},${y}`,
      '--new-window'
    ],
    defaultViewport: null
  });

  const pages = await browser.pages();
  const page = pages[0];
  await page.goto(url);
  return browser;
}


// Запуск бота
startBot();

// Обработка завершения работы скрипта
process.on('SIGINT', async () => {
  console.log('Завершение работы...');
  if (visualizationBrowser) {
    await visualizationBrowser.close();
  }
  if (dialogBrowser) {
    await dialogBrowser.close();
  }
  process.exit(0);
});
