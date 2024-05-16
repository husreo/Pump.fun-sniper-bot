# pump_fun_py

Decided to share my pump.fun codebase with the world because: 

1.) There are too many scammers out there on github and telegram.

2.) The IDL for pump.fun isn't public information, but it should be. 

Clone the repo, and add your Public Key (wallet), Private Key and RPC to the Config.py.

### Swap Layout
Do not change the hard-coded values as they are part of the actual swap instructions for the pump.fun program. 

**buy = 16927863322537952870**

**sell = 12502976635542562355**

To see for yourself, decode the "Instruction Raw Data" from any pump fun transaction using the find_instruction.py. 

### Contact

Contact me if you need help integrating the code into your own project. 

Telegram: Allen_A_Taylor (AL The Bot Father)

### FAQS

**What format should my private key be in?** 

The private key should be in the base58 string format, not bytes. 

**Why are my transactions being dropped?** 

You get what you pay for. If you use the public RPC, you're going to get rekt. Spend the money for Helius or Quick Node. Also, play around with the compute limits and lamports.

**What format is slippage in?** 

Slippage is in decimal format. Example: .05 slippage is 5%. 

### Example

```
from pump_fun import buy

#PUMP FUN MINT ADDRESS (NOT RAYDIUM)
mint_str = "token_to_buy"

#BUY
buy(mint_str=mint_str, sol_in=.1, slippage_decimal=.25)

```
```
from pump_fun import sell
from utils import get_token_balance

#PUMP FUN MINT ADDRESS (NOT RAYDIUM)
mint_str = "token_to_sell"

#SELL
token_balance = get_token_balance()
sell(mint_str=mint_str, token_balance=token_balance, slippage_decimal=.25)

```