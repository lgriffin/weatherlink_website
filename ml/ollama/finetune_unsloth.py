"""LoRA fine-tune of the forecast wording model with Unsloth.

Runs inside nvcr.io/nvidia/pytorch with ml/out mounted at /work; see
docs/machine-guides.md. Starting point: not yet run on the Spark.
"""

from datasets import load_dataset
from trl import SFTConfig, SFTTrainer
from unsloth import FastLanguageModel

BASE_MODEL = 'unsloth/Llama-3.2-3B-Instruct'
WORK = '/work'

model, tok = FastLanguageModel.from_pretrained(BASE_MODEL, max_seq_length=2048, load_in_4bit=False)
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    lora_alpha=16,
    target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
)

data = load_dataset(
    'json',
    data_files={'train': f'{WORK}/llm/train.jsonl', 'eval': f'{WORK}/llm/valid.jsonl'},
)
data = data.map(lambda ex: {'text': tok.apply_chat_template(ex['messages'], tokenize=False)})

trainer = SFTTrainer(
    model=model,
    tokenizer=tok,
    train_dataset=data['train'],
    eval_dataset=data['eval'],
    args=SFTConfig(
        dataset_text_field='text',
        per_device_train_batch_size=4,
        num_train_epochs=2,
        learning_rate=2e-4,
        logging_steps=20,
        output_dir=f'{WORK}/checkpoints',
    ),
)
trainer.train()
model.save_pretrained_merged(f'{WORK}/merged', tok, save_method='merged_16bit')
