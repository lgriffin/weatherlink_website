import json
import re
from pathlib import Path

import pandas as pd
import pytest

from wxml import llm_dataset
from wxml.__main__ import modelfile
from wxml.analogs import find_analogs
from wxml.brief import SYSTEM_PROMPT

NUMBER = re.compile(r'-?\d+(?:\.\d+)?')


@pytest.fixture(scope='module')
def dataset(tables):
    return llm_dataset.build(tables['evening'], tables['rows'], log=lambda _: None)


def test_examples_are_chat_formatted(dataset, tmp_path):
    llm_dataset.write(dataset, tmp_path)
    lines = (tmp_path / 'train.jsonl').read_text().splitlines()
    assert len(lines) == len(dataset['train']) > 500
    first = json.loads(lines[0])
    assert [m['role'] for m in first['messages']] == ['system', 'user', 'assistant']
    assert first['messages'][0]['content'] == SYSTEM_PROMPT
    assert (tmp_path / 'review.csv').exists()


def test_validation_examples_come_after_training_ones(dataset):
    assert max(e['date'] for e in dataset['train']) < min(e['date'] for e in dataset['valid'])


def test_drafts_only_state_numbers_from_the_brief(dataset):
    for ex in dataset['train'] + dataset['valid']:
        given = [float(n) for n in NUMBER.findall(ex['brief'])]
        for sentence in re.split(r'(?<=\.)\s', ex['answer']):
            if 'than usual' in sentence:  # a difference of two numbers in the brief
                continue
            for n in NUMBER.findall(sentence):
                assert any(abs(float(n) - g) <= 0.5 for g in given), (ex['date'], n, ex['answer'])


def test_briefs_never_contain_the_answer(dataset):
    for ex in dataset['valid']:
        assert f"{ex['outcome']['night_min']:.2f}" not in ex['brief']
        assert 'Issued ' + ex['date'] in ex['brief']


def test_analogs_are_earlier_evenings_only(tables):
    evenings = tables['evening']
    date = evenings.index[400]
    analogs = find_analogs(evenings, date)
    assert len(analogs) == 5
    cutoff = (pd.Timestamp(date) - pd.Timedelta(days=3)).strftime('%Y-%m-%d')
    assert all(d < cutoff for d in analogs.index)


def test_example_modelfile_matches_the_training_prompt():
    example = Path(__file__).resolve().parent.parent / 'ollama' / 'Modelfile.example'
    assert example.read_text() == modelfile('llama3.2:3b', './adapters')
