# llm_server.py
from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn
import json
import platform
import asyncio

if platform.system() == 'Windows':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

app = FastAPI()

with open('api_overview2.txt', 'r', encoding='utf-8') as file:
    api_overview = file.read()

with open('examples.txt', 'r', encoding='utf-8') as file:
    examples = file.read()

import g4f.Provider
from g4f.client import Client

client = Client()

MODEL_NAME = "gpt-4"
PROVIDER = g4f.Provider.Blackbox

class RequestData(BaseModel):
    instruction: str
    description: str

def call_llm(prompt):
    try:
        print("got request")
        response = g4f.ChatCompletion.create(
            model=MODEL_NAME,
            messages=[{'role': 'user', 'content': prompt}],
            provider=PROVIDER
        )
        #print("PROMPT: ", prompt)
        #print("RESPONSE: ", response)
        return response
    except Exception as e:
        return f"Error generating response: {str(e)}"

@app.post("/generate")
async def generate(data: RequestData):
    instruction = data.instruction
    description = data.description
    

    if not instruction or not description:
        return {'error': 'Instruction or description not provided.'}

    # Формирование запроса для LLM
    prompt = f"""
You are to write a program for a Minecraft bot.

**Context:**
- The bot operates in a Minecraft world and uses the API described below.
- It should navigate, interact with the environment, and perform tasks intelligently.

**API Description:**
{api_overview}

**Scenario:**
{description}

**Instruction:**
Generate a Node.js program for the bot to execute the following instruction:
"{instruction}"

**Requirements:**
- Use only the provided API functions.
- If required items or blocks are not immediately nearby, the bot should intelligently search for them using appropriate pathfinding and movement functions.
- The bot should handle obstacles and navigate around them when necessary.
- Do not assume that objects are within immediate reach unless specified.
- Implement error handling to manage potential issues (e.g., items not found, path blocked).
- Ensure the code is efficient and follows best coding practices.
- Do not include any explanations, comments, or usage examples.

VERY IMPORTANT: 
- USE USEFUL FUNCTIONS IF U NEED. DONT CREATE NEW FUNCTIONS THAT DUBLICATES ONE OF USEFUL FUNCTIONS, JUST USE 
- Do not use event listeners or any asynchronous patterns. 
- The bot should execute the program immediately.
- dont load plugins, act like they are already loaded
- Provide only the code without any explanations or examples of usage. 
- STRICTLY output the function 'async function botProgram(bot) {{ ... }}' without any additional text.

**Output Format:**
Provide only the code in the following format:

```javascript
async function botProgram(bot) {{
  // Your code here
}}

Examples of promts-outputs
{examples}

"""

    # Вызов LLM
    program = call_llm(prompt)
    result = {'program': program}
    return result

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
