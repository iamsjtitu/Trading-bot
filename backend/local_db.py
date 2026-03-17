"""
Local file-based async database that mimics Motor (async MongoDB driver) API.
No MongoDB needed - stores data in JSON files.
"""
import json
import os
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid
import copy


DATA_DIR = os.environ.get('LOCAL_DB_PATH', os.path.join(os.path.dirname(__file__), 'data'))


class LocalCursor:
    """Mimics motor's async cursor"""
    def __init__(self, docs: List[Dict]):
        self._docs = docs
        self._sort_key = None
        self._sort_dir = 1
        self._limit_val = 0

    def sort(self, key_or_list, direction=None):
        if isinstance(key_or_list, list):
            key_or_list, direction = key_or_list[0]
        self._sort_key = key_or_list
        self._sort_dir = direction if direction else 1
        return self

    def limit(self, n):
        self._limit_val = n
        return self

    async def to_list(self, length=None):
        docs = list(self._docs)
        if self._sort_key:
            docs.sort(
                key=lambda x: x.get(self._sort_key, ''),
                reverse=(self._sort_dir == -1)
            )
        limit = self._limit_val or length
        if limit and limit > 0:
            docs = docs[:limit]
        return docs


class LocalCollection:
    """Mimics motor's async collection"""
    def __init__(self, name: str, data_dir: str):
        self.name = name
        self._data_dir = data_dir
        self._file = os.path.join(data_dir, f'{name}.json')
        self._docs = self._load()

    def _load(self) -> List[Dict]:
        if os.path.exists(self._file):
            try:
                with open(self._file, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return []
        return []

    def _save(self):
        os.makedirs(self._data_dir, exist_ok=True)
        with open(self._file, 'w') as f:
            json.dump(self._docs, f, indent=2, default=str)

    def _matches(self, doc: Dict, filter_dict: Dict) -> bool:
        for key, value in filter_dict.items():
            if key == '$or':
                if not any(self._matches(doc, cond) for cond in value):
                    return False
                continue
            if isinstance(value, dict):
                for op, op_val in value.items():
                    if op == '$gte' and not (doc.get(key, '') >= op_val):
                        return False
                    elif op == '$lte' and not (doc.get(key, '') <= op_val):
                        return False
                    elif op == '$gt' and not (doc.get(key, '') > op_val):
                        return False
                    elif op == '$lt' and not (doc.get(key, '') < op_val):
                        return False
                    elif op == '$ne' and doc.get(key) == op_val:
                        return False
                    elif op == '$in' and doc.get(key) not in op_val:
                        return False
            else:
                if doc.get(key) != value:
                    return False
        return True

    def _apply_projection(self, doc: Dict, projection: Optional[Dict]) -> Dict:
        if not projection:
            result = copy.deepcopy(doc)
            result.pop('_id', None)
            return result
        result = {}
        exclude_id = projection.get('_id', 1) == 0
        for key, include in projection.items():
            if key == '_id':
                continue
            if include:
                if key in doc:
                    result[key] = copy.deepcopy(doc[key])
        if not exclude_id and '_id' in doc:
            result['_id'] = doc['_id']
        if not any(v == 1 for k, v in projection.items() if k != '_id'):
            result = copy.deepcopy(doc)
            for key, exclude in projection.items():
                if exclude == 0 and key in result:
                    del result[key]
        return result

    def find(self, filter_dict: Optional[Dict] = None, projection: Optional[Dict] = None) -> LocalCursor:
        filter_dict = filter_dict or {}
        matched = [self._apply_projection(d, projection) for d in self._docs if self._matches(d, filter_dict)]
        return LocalCursor(matched)

    async def find_one(self, filter_dict: Optional[Dict] = None, projection: Optional[Dict] = None) -> Optional[Dict]:
        filter_dict = filter_dict or {}
        for doc in self._docs:
            if self._matches(doc, filter_dict):
                return self._apply_projection(doc, projection)
        return None

    async def insert_one(self, doc: Dict):
        doc_copy = copy.deepcopy(doc)
        if '_id' not in doc_copy:
            doc_copy['_id'] = str(uuid.uuid4())
        self._docs.append(doc_copy)
        self._save()
        class InsertResult:
            inserted_id = doc_copy['_id']
        return InsertResult()

    async def update_one(self, filter_dict: Dict, update: Dict, upsert: bool = False):
        for i, doc in enumerate(self._docs):
            if self._matches(doc, filter_dict):
                if '$set' in update:
                    for key, value in update['$set'].items():
                        keys = key.split('.')
                        target = self._docs[i]
                        for k in keys[:-1]:
                            if k not in target:
                                target[k] = {}
                            target = target[k]
                        target[keys[-1]] = value
                if '$inc' in update:
                    for key, value in update['$inc'].items():
                        current = self._docs[i].get(key, 0)
                        self._docs[i][key] = current + value
                if '$push' in update:
                    for key, value in update['$push'].items():
                        if key not in self._docs[i]:
                            self._docs[i][key] = []
                        self._docs[i][key].append(value)
                self._save()
                class UpdateResult:
                    modified_count = 1
                    matched_count = 1
                return UpdateResult()
        if upsert:
            new_doc = copy.deepcopy(filter_dict)
            if '$set' in update:
                for key, value in update['$set'].items():
                    keys = key.split('.')
                    target = new_doc
                    for k in keys[:-1]:
                        if k not in target:
                            target[k] = {}
                        target = target[k]
                    target[keys[-1]] = value
            await self.insert_one(new_doc)
        class UpdateResult:
            modified_count = 0
            matched_count = 0
        return UpdateResult()

    async def delete_one(self, filter_dict: Dict):
        for i, doc in enumerate(self._docs):
            if self._matches(doc, filter_dict):
                self._docs.pop(i)
                self._save()
                class DeleteResult:
                    deleted_count = 1
                return DeleteResult()
        class DeleteResult:
            deleted_count = 0
        return DeleteResult()

    async def delete_many(self, filter_dict: Dict):
        original_len = len(self._docs)
        self._docs = [d for d in self._docs if not self._matches(d, filter_dict)]
        deleted = original_len - len(self._docs)
        if deleted > 0:
            self._save()
        class DeleteResult:
            deleted_count = deleted
        return DeleteResult()

    async def count_documents(self, filter_dict: Optional[Dict] = None) -> int:
        filter_dict = filter_dict or {}
        return sum(1 for d in self._docs if self._matches(d, filter_dict))


class LocalDatabase:
    """Mimics motor's async database"""
    def __init__(self, data_dir: str = None):
        self._data_dir = data_dir or DATA_DIR
        os.makedirs(self._data_dir, exist_ok=True)
        self._collections = {}

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        if name not in self._collections:
            self._collections[name] = LocalCollection(name, self._data_dir)
        return self._collections[name]

    def __getitem__(self, name):
        return self.__getattr__(name)


def get_local_db(data_dir: str = None) -> LocalDatabase:
    return LocalDatabase(data_dir)
